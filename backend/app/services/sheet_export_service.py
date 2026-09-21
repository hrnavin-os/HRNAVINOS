"""One-way export of the Induction and Foundation boards into a spreadsheet an
admin nominates from Settings.

    Induction - <section> tabs   <-  induction entries  (Admin > Induction Leads)
    Foundation - <section> tabs  <-  Foundation leads   (Admin > All Leads)

The two tab names an admin picks are prefixes: each board is split into one tab
per section ("Induction - A Section"), the same split the two-way sync uses.

The spreadsheet is a mirror, never a source: each run rewrites both tabs from
the database, so anything typed into them is replaced the next time round.
That is the whole difference from lead_sheet_sync_service, which is two-way and
therefore needs a per-row snapshot to tell a sheet edit from an ERP edit. An
export needs no snapshots and no ERP ID column - only the headers and the rows.

The column sets are not redefined here. InductionTab and FoundationTab in
lead_sheet_tabs already describe what each board's columns are called and how a
record renders into them, and a second copy of those lists would drift from the
boards the moment a field was added to one of them.

WHY A BACKGROUND TASK
---------------------
The point of the mirror is that the spreadsheet is current whether or not
anyone has the app open, so it can't piggyback on a request. Every gunicorn
worker runs the loop and a lease on the SheetExport document lets exactly one
of them export at a time; the lease expires by itself if that worker dies.

Unlike the two-way sync there is no env-var gate on this: it is off until an
admin pastes a link and turns it on, and that link lives in the database, so a
dev database simply has no spreadsheet to write to.
"""
import asyncio
import logging
import random
import re
import uuid
from datetime import timedelta

import httpx

from app.config.settings import settings
from app.database.base import utcnow
from app.exceptions.base import BadRequestError
from app.models.sheet_export import SheetExport, SheetExportTabStats
from app.repositories.sheet_export_repository import SheetExportRepository
from app.schemas.sheet_export_schema import (
    SheetExportResponse,
    SheetExportTabInfo,
    SheetExportUpdate,
)
from app.services.audit_service import AuditService
from app.services.google_sheets_client import (
    SheetsClient,
    SheetsError,
    access_token,
    service_account_email,
)
from app.services.lead_sheet_sync_service import is_sync_tab, section_tabs
from app.services.lead_sheet_tabs import SheetTabSpec, error_message

logger = logging.getLogger("app.integrations.sheet_export")

# Longest a run may hold the lease. Far beyond a real run; only matters when a
# worker dies mid-export.
LEASE = timedelta(minutes=5)
# How often each worker checks whether a run is due.
POLL_SECONDS = 15

# A pasted Google Sheets URL, or the bare id out of one.
_URL_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9_-]+)")
_BARE_ID = re.compile(r"^[a-zA-Z0-9_-]{20,}$")

# What each exported tab is called on the page. The board names, not the model
# names, so the page reads like the sidebar.
TAB_LABELS = {"induction": "Induction Leads", "foundation": "Foundation Leads"}


def parse_spreadsheet_id(raw: str) -> str:
    """The spreadsheet id out of a pasted link (or a bare id typed in).

    Tolerant on purpose: what an admin has in the clipboard is whatever the
    browser's address bar held, which carries an /edit suffix and often a #gid
    fragment or a ?usp=sharing query.
    """
    text = raw.strip()
    match = _URL_ID.search(text)
    if match:
        return match.group(1)
    if _BARE_ID.match(text):
        return text
    raise BadRequestError(
        "That doesn't look like a Google Sheets link. Open the spreadsheet and copy the address from the "
        "browser - it looks like https://docs.google.com/spreadsheets/d/.../edit"
    )


def _pad(row: list[str], width: int) -> list[str]:
    return [str(cell) for cell in row[:width]] + [""] * max(0, width - len(row))


class TabExport:
    """One run over one tab."""

    def __init__(self, spec: SheetTabSpec) -> None:
        self.spec = spec
        self.headers = [column.header for column in spec.columns]

    async def grid(self) -> list[list[str]]:
        """Row 1 is the board's headers; every row under it is one record."""
        await self.spec.prepare()
        rows = [self.headers]
        for record in await self.spec.load_records():
            values = self.spec.values(record)
            rows.append([values.get(column.key, "") for column in self.spec.columns])
        return rows


class SheetExportService:
    def __init__(self) -> None:
        self.repo = SheetExportRepository()
        self.audit = AuditService()

    # -- configuration ------------------------------------------------------

    async def specs(self, config: SheetExport, existing: set[str] = frozenset()) -> list[tuple[str, SheetTabSpec]]:
        return await section_tabs(config.induction_tab, config.foundation_tab, existing)

    async def get(self) -> SheetExport:
        return await self.repo.get_or_create()

    @staticmethod
    def _collision(spreadsheet_id: str | None, induction: str, foundation: str) -> str | None:
        """Why this target would fight the two-way sync, if it would.

        Both write whole tabs from the database, but not the same ones: the
        two-way sync's carry an ERP ID and a Sync Note column that a mirror
        does not. Pointed at one tab, each would read the other's output,
        conclude the tab had been changed, and rewrite it - forever, a write
        every cycle, with the sheet flickering between two layouts and the row
        snapshots the two-way sync needs to spot a *human* edit being
        invalidated every time. Impossible to diagnose from the spreadsheet.

        Answered fresh every time rather than decided once when the link was
        saved, because whether the two-way sync runs at all is an env-var
        decision (LEAD_SHEET_SYNC_ENABLED, defaulting to on in production).
        A target saved on a laptop, where the sync is off and nothing clashes,
        is the same target in production, where it does - so the save is not
        the only place this has to hold.
        """
        if not settings.lead_sheet_sync_enabled or spreadsheet_id != settings.LEAD_SHEET_SPREADSHEET_ID:
            return None
        clashing = sorted(tab for tab in {induction, foundation} if is_sync_tab(tab))
        if not clashing:
            return None
        return (
            f"This server already runs its two-way sync on the {', '.join(clashing)} "
            f"tab{'s' if len(clashing) > 1 else ''} of that spreadsheet, and the two would overwrite each "
            "other. Use a different spreadsheet, or name these tabs something else."
        )

    def _collision_for(self, config: SheetExport) -> str | None:
        return self._collision(config.spreadsheet_id, config.induction_tab, config.foundation_tab)

    async def update(self, data: SheetExportUpdate, *, actor_id: uuid.UUID | None) -> SheetExport:
        config = await self.repo.get_or_create()
        update = data.model_dump(exclude_unset=True)

        if "spreadsheet_url" in update:
            raw = (update.pop("spreadsheet_url") or "").strip()
            if raw:
                update["spreadsheet_id"] = parse_spreadsheet_id(raw)
                update["spreadsheet_url"] = raw
            else:
                # Clearing the link disconnects the export rather than leaving
                # it enabled with nowhere to write.
                update["spreadsheet_id"] = None
                update["spreadsheet_url"] = None
                update["enabled"] = False
                update["tabs"] = {}
                update["last_error"] = None

        if update.get("enabled") and not (update.get("spreadsheet_id") or config.spreadsheet_id):
            raise BadRequestError("Paste the Google Sheets link first, then turn the export on.")

        for key in ("induction_tab", "foundation_tab"):
            if update.get(key):
                update[key] = update[key].strip()

        induction = update.get("induction_tab", config.induction_tab)
        foundation = update.get("foundation_tab", config.foundation_tab)
        if induction == foundation:
            raise BadRequestError("The Induction and Foundation tabs must be two different tabs.")

        collision = self._collision(update.get("spreadsheet_id", config.spreadsheet_id), induction, foundation)
        if collision:
            raise BadRequestError(collision)

        # A changed target is a fresh start: what the old tabs held says
        # nothing about the new ones, and the next run is due immediately so
        # the admin sees the result instead of waiting out the interval.
        retargeted = update.get("spreadsheet_id", config.spreadsheet_id) != config.spreadsheet_id or {
            induction,
            foundation,
        } != {config.induction_tab, config.foundation_tab}
        if retargeted:
            update.setdefault("tabs", {})
            update["next_run_at"] = None
            update["last_error"] = None

        update["updated_by"] = actor_id
        config = await self.repo.update(config, update)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="SheetExport",
            entity_id=str(config.id),
            changes=update,
        )
        return config

    # -- status -------------------------------------------------------------

    def _blocked_reason(self, config: SheetExport) -> str | None:
        if not config.spreadsheet_id:
            return "No spreadsheet linked yet. Paste the Google Sheets link above."
        if not config.enabled:
            return "The export is turned off. Turn it on to keep the spreadsheet up to date."
        # Saved when nothing clashed, but this server runs the two-way sync.
        return self._collision_for(config)

    async def status(self) -> SheetExportResponse:
        config = await self.repo.get_or_create()
        tabs = []
        for tab_name, spec in await self.specs(config):
            board = spec.key.split(":")[0]
            section = tab_name.rsplit(" - ", 1)[-1]
            tabs.append(
                SheetExportTabInfo(
                    key=spec.key,
                    label=f"{TAB_LABELS.get(board, board.title())} - {section}",
                    tab_name=tab_name,
                    headers=[column.header for column in spec.columns],
                    # Counted through the spec's own filter rather than a
                    # repeat of it here, so the figure can't disagree with
                    # what a run would actually write.
                    record_count=len(await spec.load_records()),
                    stats=config.tabs.get(spec.key),
                )
            )
        blocked = self._blocked_reason(config)
        return SheetExportResponse(
            spreadsheet_url=config.spreadsheet_url,
            spreadsheet_id=config.spreadsheet_id,
            induction_tab=config.induction_tab,
            foundation_tab=config.foundation_tab,
            enabled=config.enabled,
            interval_seconds=config.interval_seconds,
            ready=blocked is None,
            blocked_reason=blocked,
            service_account_email=service_account_email(),
            credential=config.credential,
            running=bool(config.running_until and config.running_until > utcnow()),
            last_started_at=config.last_started_at,
            last_finished_at=config.last_finished_at,
            last_success_at=config.last_success_at,
            next_run_at=config.next_run_at,
            last_error=config.last_error,
            tabs=tabs,
            updated_at=config.updated_at,
        )

    # -- the run ------------------------------------------------------------

    async def export_once(self, sheets, config: SheetExport) -> dict[str, SheetExportTabStats]:
        """One full export against `sheets` (a SheetsClient, or a fake in
        tests). No lease - callers that can race hold one."""
        specs = await self.specs(config, set(await sheets.tab_titles()))
        names = [name for name, _ in specs]
        # Before the read: a spreadsheet the admin has only just created has
        # neither tab, and reading a range that doesn't exist is an error.
        created = await sheets.ensure_tabs(names)
        if created:
            logger.info("sheet_export_created_tabs", extra={"tabs": created})
        current = await sheets.read_tabs(names)

        stats = {}
        for name, spec in specs:
            grid = await TabExport(spec).grid()
            width = max(len(row) for row in grid)
            existing = [_pad(row, width) for row in current.get(name, [])]
            # Only when it differs: the mirror is rewritten on a schedule, and
            # a write every interval would burn the API quota restating rows
            # that have not moved - and would show up as a permanent stream of
            # edits in the spreadsheet's own revision history.
            changed = existing != grid
            if changed:
                await sheets.write_tab(name, grid, previous_rows=len(current.get(name, [])))
            stats[spec.key] = SheetExportTabStats(rows=len(grid) - 1, columns=width, written=changed)
        return stats

    async def _acquire(self, *, force: bool) -> bool:
        await self.repo.get_or_create()
        now = utcnow()
        condition: dict = {
            "key": "sheet_export",
            "enabled": True,
            "spreadsheet_id": {"$ne": None},
            "$or": [{"running_until": None}, {"running_until": {"$lt": now}}],
        }
        if not force:
            condition["$and"] = [{"$or": [{"next_run_at": None}, {"next_run_at": {"$lte": now}}]}]
        result = await SheetExport.get_motor_collection().update_one(
            condition, {"$set": {"running_until": now + LEASE, "last_started_at": now}}
        )
        return result.modified_count == 1

    async def run(self, *, force: bool = False) -> bool:
        """Exports if due (or `force`) and no other worker is mid-run.
        Returns whether this call ran one."""
        if not await self._acquire(force=force):
            return False
        config = await self.repo.get_or_create()
        update: dict = {}
        try:
            collision = self._collision_for(config)
            if collision:
                raise SheetsError(collision)
            async with httpx.AsyncClient(timeout=30) as http:
                token, credential = await access_token(http)
                stats = await self.export_once(SheetsClient(http, token, config.spreadsheet_id), config)
            update = {
                "last_success_at": utcnow(),
                "last_error": None,
                "credential": credential,
                "tabs": {key: value.model_dump() for key, value in stats.items()},
            }
        except SheetsError as exc:
            update = {"last_error": str(exc)}
            logger.warning("sheet_export_failed", extra={"error": str(exc)})
        except Exception as exc:
            update = {"last_error": f"Unexpected error: {error_message(exc)}"}
            logger.exception("sheet_export_crashed")
        finally:
            finished = utcnow()
            await SheetExport.get_motor_collection().update_one(
                {"key": "sheet_export"},
                {
                    "$set": {
                        **update,
                        "running_until": None,
                        "last_finished_at": finished,
                        "next_run_at": finished + timedelta(seconds=config.interval_seconds),
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
            await SheetExportService().run()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("sheet_export_loop_error")
        await asyncio.sleep(POLL_SECONDS + random.uniform(0, 3))
