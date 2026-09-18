"""Request/response DTOs for the Sheet Export settings page."""
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.sheet_export import SheetExportTabStats


class SheetExportUpdate(BaseModel):
    """Every field optional: the page saves the link on its own, and the
    Enabled switch on its own, without either resending the other."""

    # Accepts a full Google Sheets URL or a bare spreadsheet id. Empty string
    # clears the link (and, with it, the export) - see the service.
    spreadsheet_url: str | None = Field(default=None, max_length=500)
    induction_tab: str | None = Field(default=None, min_length=1, max_length=100)
    foundation_tab: str | None = Field(default=None, min_length=1, max_length=100)
    enabled: bool | None = None
    interval_seconds: int | None = Field(default=None, ge=60, le=86400)


class SheetExportTabInfo(BaseModel):
    """One exported tab, described for the page: which board it mirrors, the
    tab it writes to, and the headers it writes in row 1 - so an admin can see
    what will land in the spreadsheet before turning the export on."""

    key: str
    label: str
    tab_name: str
    headers: list[str]
    # Rows currently on the board, so the page can say what will be written
    # without waiting for a run.
    record_count: int
    stats: SheetExportTabStats | None = None


class SheetExportResponse(BaseModel):
    spreadsheet_url: str | None
    spreadsheet_id: str | None
    induction_tab: str
    foundation_tab: str
    enabled: bool
    interval_seconds: int
    # Whether the export can actually run: enabled, with a link, and with a
    # Google credential on the server.
    ready: bool
    # Why it can't, when it can't - shown as the page's one explanation.
    blocked_reason: str | None
    # The address to share the spreadsheet with, when a service account is set.
    service_account_email: str | None
    credential: str | None
    running: bool
    last_started_at: datetime | None
    last_finished_at: datetime | None
    last_success_at: datetime | None
    next_run_at: datetime | None
    last_error: str | None
    tabs: list[SheetExportTabInfo]
    updated_at: datetime | None
