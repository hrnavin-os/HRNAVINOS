"""Config and last-run state for the Sheet Export — the one-way mirror of the
Induction and Foundation boards into a spreadsheet an admin nominates.

One singleton document, holding both what to export and how the last run went,
because the Settings page reads the two together and there is only ever one of
each.

Distinct from LeadSheetSyncState (app/models/lead_sheet_sync.py) on purpose.
That is the *two-way* sync against a spreadsheet fixed at deploy time in
LEAD_SHEET_SPREADSHEET_ID, and its row snapshots exist to tell a sheet edit
apart from an ERP edit. This one is an export: the sheet is a copy of the
boards, never a source, so it needs no snapshots - only a link, which is why
the link lives here in the database where an admin can change it.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument


class SheetExportTabStats(BaseModel):
    """What the last run wrote to one tab."""

    rows: int = 0
    columns: int = 0
    # False when the run found the tab unchanged and skipped the write.
    written: bool = False


class SheetExport(BaseDocument):
    key: str = "sheet_export"

    # --- what to export to -------------------------------------------------
    # The link exactly as it was pasted, kept so the page can show it back and
    # offer it as a hyperlink; spreadsheet_id is what the API is called with.
    spreadsheet_url: str | None = None
    spreadsheet_id: str | None = None
    induction_tab: str = "Induction"
    foundation_tab: str = "Foundation"
    # Off until an admin turns it on, so pasting a link to check the headers
    # doesn't immediately start writing to somebody's spreadsheet.
    enabled: bool = False
    interval_seconds: int = Field(default=300, ge=60)

    # --- last run ----------------------------------------------------------
    # Set while a worker is exporting; expires on its own if that worker dies
    # mid-run, so a crash can never wedge the export.
    running_until: datetime | None = None
    next_run_at: datetime | None = None
    last_started_at: datetime | None = None
    last_finished_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    # Which Google credential the last run used, for the status panel.
    credential: str | None = None
    tabs: dict[str, SheetExportTabStats] = Field(default_factory=dict)

    updated_by: uuid.UUID | None = None

    class Settings:
        name = "sheet_exports"
        indexes = [IndexModel([("key", 1)], unique=True)]

    def __repr__(self) -> str:
        return f"<SheetExport {self.spreadsheet_id or 'unconfigured'}>"
