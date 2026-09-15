"""Two-way sync between the Lead Dashboard and the Admin Portal Backup sheet.

    Induction tab  <->  every induction entry (Admin Head > Induction Leads)
    Foundation tab <->  every Foundation lead  (Admin Head > All Leads)

HOW A RUN WORKS
---------------
1. Read both tabs.
2. For each sheet row carrying an ERP ID, compare every editable cell with the
   snapshot of what the sync last wrote there (LeadSheetSyncRow). A cell that
   differs was edited in the sheet, and is saved into the ERP through the same
   service calls the board uses. Anything the ERP refuses is reverted and
   explained in the row's Sync Note column.
3. A row with no ERP ID is new: it is added to the ERP (or linked to the record
   with the same mobile number, if one isn't in the sheet yet) and gets its ID.
4. Re-read the ERP and write the tab back from it. That one write carries ERP
   edits out to the sheet, new ERP records in as appended rows, and deleted
   records out - and it only happens when the result differs from what was read.

Both sides editing the same cell between runs: the sheet edit is applied last,
so it wins. Deleting a row in the sheet does not delete the record - it comes
back on the next run. Delete in the ERP instead; the row then disappears.

WHY A BACKGROUND TASK (unlike ReminderService's sweep-on-read)
--------------------------------------------------------------
A sheet edit has to reach the ERP whether or not anyone has the app open, so
this can't piggyback on a request. Every gunicorn worker runs the loop, and a
lease on LeadSheetSyncState lets exactly one of them sync at a time; the lease
expires by itself if that worker dies.
"""
import asyncio
import logging
import random
import uuid
from datetime import timedelta

import httpx
from pymongo import DeleteMany, UpdateOne
from pymongo.errors import DuplicateKeyError

from app.config.settings import settings
from app.database.base import utcnow
from app.models.lead_sheet_sync import LeadSheetSyncRow, LeadSheetSyncState, LeadSheetTabStats
from app.services.google_sheets_client import SheetsClient, SheetsError, access_token
from app.services.lead_sheet_tabs import Column, FoundationTab, InductionTab, SheetTabSpec, error_message
from app.utils.phone import normalize_phone

logger = logging.getLogger("app.integrations.lead_sheet_sync")

ID_COLUMN = Column("erp_id", "ERP ID", editable=False)
NOTE_COLUMN = Column("sync_note", "Sync Note", editable=False)
# Longest a run may hold the lease. Far beyond a real run (a few seconds); only
# matters when a worker dies mid-sync.
LEASE = timedelta(minutes=5)
# How often each worker checks whether a run is due.
POLL_SECONDS = 10


def _norm(value: str) -> str:
    return " ".join(value.split())


def _pad(row: list[str], width: int) -> list[str]:
    return [str(cell) for cell in row[:width]] + [""] * max(0, width - len(row))


class TabSync:
    """One run over one tab."""

    def __init__(self, spec: SheetTabSpec) -> None:
        self.spec = spec
        self.columns = [ID_COLUMN, *spec.columns, NOTE_COLUMN]
        self.headers = [column.header for column in self.columns]
        self.stats = LeadSheetTabStats()

    def _locate(self, header_row: list[str]) -> dict[str, int]:
        """Column key -> index in the sheet, matched on header text so a
        column moved by hand is still read correctly."""
        wanted = {_norm(column.header).lower(): column.key for column in self.columns}
        found = {}
        for index, cell in enumerate(header_row):
            key = wanted.get(_norm(str(cell)).lower())
            if key and key not in found:
                found[key] = index
        return found

    async def run(self, grid: list[list[str]]) -> tuple[list[list[str]] | None, dict]:
        """Returns (grid to write or None if unchanged, row snapshots to store)."""
        spec = self.spec
        await spec.prepare()
        records = {str(record.id): record for record in await spec.load_records()}
        snapshots = {
            str(row.record_id): row for row in await LeadSheetSyncRow.find({"tab": spec.key}).to_list()
        }

        positions = self._locate(grid[0]) if grid else {}
        if grid and len(grid) > 1 and "erp_id" not in positions:
            raise SheetsError(
                f"The {spec.key} tab has data but no 'ERP ID' header in row 1, so its rows can't be matched "
                "to the ERP. Restore the header row (or clear the tab) and the next sync will rebuild it."
            )
        sheet_rows = []
        for row in grid[1:]:
            cells = {key: str(row[index]) if index < len(row) else "" for key, index in positions.items()}
            if any(value.strip() for key, value in cells.items() if key != "sync_note"):
                sheet_rows.append(cells)

        ids_in_sheet = {cells.get("erp_id", "").strip() for cells in sheet_rows}
        unlisted_by_phone = {}
        for record_id, record in records.items():
            if record_id not in ids_in_sheet and normalize_phone(record.phone):
                unlisted_by_phone.setdefault(normalize_phone(record.phone), record_id)

        # Each output row: ("record", id) or ("raw", cells, note) for a row the
        # ERP couldn't take, kept in place so nothing typed is lost.
        layout: list[tuple] = []
        placed: set[str] = set()
        notes: dict[str, str | None] = {rid: snap.note for rid, snap in snapshots.items()}

        for cells in sheet_rows:
            record_id = cells.get("erp_id", "").strip()
            if record_id:
                if record_id in placed:
                    continue  # a copy-pasted duplicate of a row already placed
                record = records.get(record_id)
                if record is None:
                    if record_id in snapshots:
                        continue  # deleted (or taken off the board) in the ERP
                    layout.append(
                        ("raw", cells, "No ERP record has this ERP ID. Clear the ERP ID cell to add the row as new.")
                    )
                    continue
                base = snapshots[record_id].values if record_id in snapshots else spec.values(record)
                await self._apply_edits(record, cells, base, notes, only_filled=False)
            else:
                record_id = unlisted_by_phone.pop(normalize_phone(cells.get(spec.phone_column, "")) or "", None)
                if record_id:
                    # Already in the ERP but not in the sheet: link rather than
                    # duplicate, taking only the cells the row actually fills.
                    record = records[record_id]
                    await self._apply_edits(record, cells, spec.values(record), notes, only_filled=True)
                else:
                    try:
                        record, errors = await spec.create(cells)
                    except Exception as exc:  # noqa: BLE001 - shown in the sheet
                        layout.append(("raw", cells, f"Not added to the ERP: {error_message(exc)}"))
                        continue
                    record_id = str(record.id)
                    notes[record_id] = "; ".join(errors) or None
                    self.stats.created += 1
            placed.add(record_id)
            layout.append(("record", record_id))

        # Re-read: the edits above changed records, and the ERP may have added
        # or deleted some while this ran.
        records = {str(record.id): record for record in await spec.load_records()}
        for record_id in records:
            if record_id not in placed:
                layout.append(("record", record_id))
                placed.add(record_id)

        width = len(self.columns)
        out = [self.headers]
        new_snapshots: dict[str, tuple[dict[str, str], str | None]] = {}
        for item in layout:
            if item[0] == "raw":
                _, cells, note = item
                out.append([note if column is NOTE_COLUMN else cells.get(column.key, "") for column in self.columns])
                self.stats.problems += 1
                continue
            record = records.get(item[1])
            if record is None:
                continue
            values = spec.values(record)
            note = notes.get(item[1])
            self.stats.problems += bool(note)
            new_snapshots[item[1]] = (values, note)
            values = {**values, "erp_id": item[1], "sync_note": note or ""}
            out.append([values.get(column.key, "") for column in self.columns])
        self.stats.rows = len(out) - 1

        current = [_pad(row, width) for row in grid]
        return (None if current == out else out), new_snapshots

    async def _apply_edits(self, record, cells: dict[str, str], base: dict[str, str], notes: dict, *, only_filled: bool) -> None:
        edits = {
            column.key: cells[column.key]
            for column in self.spec.columns
            if column.editable
            and not column.create_only
            and column.key in cells
            and (cells[column.key].strip() or not only_filled)
            and _norm(cells[column.key]) != _norm(base.get(column.key, ""))
        }
        if not edits:
            return
        errors = await self.spec.apply(record, edits, cells)
        notes[str(record.id)] = "; ".join(errors) or None
        if len(errors) < len(edits):
            self.stats.updated += 1


async def _store_snapshots(tab: str, snapshots: dict[str, tuple[dict[str, str], str | None]]) -> None:
    collection = LeadSheetSyncRow.get_motor_collection()
    now = utcnow()
    operations = [
        UpdateOne(
            {"tab": tab, "record_id": uuid.UUID(record_id)},
            {
                "$set": {"values": values, "note": note, "updated_at": now},
                "$setOnInsert": {
                    "_id": uuid.uuid4(),
                    "created_at": now,
                    "is_deleted": False,
                },
            },
            upsert=True,
        )
        for record_id, (values, note) in snapshots.items()
    ]
    keep = [uuid.UUID(record_id) for record_id in snapshots]
    operations.append(DeleteMany({"tab": tab, "record_id": {"$nin": keep}}))
    await collection.bulk_write(operations, ordered=False)


class LeadSheetSyncService:
    def tabs(self) -> list[tuple[str, SheetTabSpec]]:
        return [
            (settings.LEAD_SHEET_INDUCTION_TAB, InductionTab()),
            (settings.LEAD_SHEET_FOUNDATION_TAB, FoundationTab()),
        ]

    async def state(self) -> LeadSheetSyncState:
        state = await LeadSheetSyncState.find_one({"key": "lead_sheets"})
        if state is None:
            try:
                state = LeadSheetSyncState()
                await state.insert()
            except DuplicateKeyError:  # another worker created it first
                state = await LeadSheetSyncState.find_one({"key": "lead_sheets"})
        return state

    async def sync_once(self, sheets) -> dict[str, LeadSheetTabStats]:
        """One full run against `sheets` (a SheetsClient, or a fake in tests).
        No lease - callers that can race hold one."""
        tabs = self.tabs()
        grids = await sheets.read_tabs([name for name, _ in tabs])
        stats = {}
        for name, spec in tabs:
            grid = grids.get(name, [])
            tab_sync = TabSync(spec)
            out, snapshots = await tab_sync.run(grid)
            if out is not None:
                await sheets.write_tab(name, out, previous_rows=len(grid))
            # Only after the write lands: a snapshot describes the sheet, and
            # a failed write must leave the old one to compare against.
            await _store_snapshots(spec.key, snapshots)
            stats[spec.key] = tab_sync.stats
        return stats

    async def _acquire(self, *, force: bool) -> bool:
        await self.state()
        now = utcnow()
        condition: dict = {
            "key": "lead_sheets",
            "$or": [{"running_until": None}, {"running_until": {"$lt": now}}],
        }
        if not force:
            condition["$and"] = [{"$or": [{"next_run_at": None}, {"next_run_at": {"$lte": now}}]}]
        result = await LeadSheetSyncState.get_motor_collection().update_one(
            condition, {"$set": {"running_until": now + LEASE, "last_started_at": now}}
        )
        return result.modified_count == 1

    async def run(self, *, force: bool = False) -> bool:
        """Syncs if due (or `force`) and no other worker is mid-run.
        Returns whether this call ran one."""
        if not settings.lead_sheet_sync_enabled or not await self._acquire(force=force):
            return False
        update: dict = {}
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                token, credential = await access_token(http)
                stats = await self.sync_once(SheetsClient(http, token, settings.LEAD_SHEET_SPREADSHEET_ID))
            update = {
                "last_success_at": utcnow(),
                "last_error": None,
                "credential": credential,
                "tabs": {key: value.model_dump() for key, value in stats.items()},
            }
        except SheetsError as exc:
            update = {"last_error": str(exc)}
            logger.warning("lead_sheet_sync_failed", extra={"error": str(exc)})
        except Exception as exc:
            update = {"last_error": f"Unexpected error: {error_message(exc)}"}
            logger.exception("lead_sheet_sync_crashed")
        finally:
            finished = utcnow()
            await LeadSheetSyncState.get_motor_collection().update_one(
                {"key": "lead_sheets"},
                {
                    "$set": {
                        **update,
                        "running_until": None,
                        "last_finished_at": finished,
                        "next_run_at": finished + timedelta(seconds=settings.LEAD_SHEET_SYNC_INTERVAL_SECONDS),
                    }
                },
            )
        return True


async def run_forever() -> None:
    """The per-worker loop started from the app lifespan."""
    # Stagger workers so they don't all poll in the same instant.
    await asyncio.sleep(random.uniform(0, POLL_SECONDS))
    while True:
        try:
            await LeadSheetSyncService().run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("lead_sheet_sync_loop_error")
        await asyncio.sleep(POLL_SECONDS + random.uniform(0, 2))

