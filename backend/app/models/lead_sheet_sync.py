"""State for the two-way Lead Dashboard <-> Google Sheet sync.

LeadSheetSyncState is a singleton: the cross-worker lease that makes sure one
gunicorn worker syncs at a time, plus what the last run did.

LeadSheetSyncRow is the sync's memory of one row as it last wrote it. That
snapshot is what makes the sync two-way rather than last-writer-wins: a sheet
cell that differs from the snapshot was edited in the sheet, and a record that
differs from the snapshot was edited in the ERP. Without it the two cases look
identical - the sheet and the database simply disagree.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument


class LeadSheetTabStats(BaseModel):
    rows: int = 0
    # What the last run changed in the ERP from sheet edits.
    created: int = 0
    updated: int = 0
    # Rows carrying a Sync Note the sheet user needs to act on.
    problems: int = 0


class LeadSheetSyncState(BaseDocument):
    key: str = "lead_sheets"
    # Set while a worker is syncing; expires on its own if that worker dies
    # mid-run, so a crash can never wedge the sync.
    running_until: datetime | None = None
    # Not before this - keeps four workers polling from syncing four times as
    # often as intended.
    next_run_at: datetime | None = None
    last_started_at: datetime | None = None
    last_finished_at: datetime | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    credential: str | None = None
    tabs: dict[str, LeadSheetTabStats] = Field(default_factory=dict)

    class Settings:
        name = "lead_sheet_sync_state"
        indexes = [IndexModel([("key", 1)], unique=True)]


class LeadSheetSyncRow(BaseDocument):
    tab: str
    record_id: uuid.UUID
    # Column key -> the cell text last written for this record.
    values: dict[str, str] = Field(default_factory=dict)
    # Why the last sheet edit to this row was not saved, shown in the sheet's
    # Sync Note column until a later edit to the row goes through.
    note: str | None = None

    class Settings:
        name = "lead_sheet_sync_rows"
        indexes = [IndexModel([("tab", 1), ("record_id", 1)], unique=True)]
