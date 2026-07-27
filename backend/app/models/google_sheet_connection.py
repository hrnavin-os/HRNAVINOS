"""GoogleSheetConnection — a singleton document holding the OAuth tokens for
the single Google account connected to the Marketing Board's Sheets
integration, plus every spreadsheet registered as a lead source."""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument


class SheetTab(BaseModel):
    name: str
    row_count: int = 0
    # Header is row 1; data rows already imported are tracked so re-syncs
    # only look at new rows appended below.
    last_synced_row: int = 1


class ConnectedSheet(BaseModel):
    spreadsheet_id: str
    url: str
    name: str
    tabs: list[SheetTab] = Field(default_factory=list)
    last_sync_at: datetime | None = None


class GoogleSheetConnection(BaseDocument):
    # OAuth client credentials, editable at runtime from the Marketing Board's
    # Settings modal. Fall back to GOOGLE_OAUTH_* env vars when unset.
    client_id: str | None = None
    client_secret: str | None = None
    redirect_uri: str | None = None

    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    connected_by: uuid.UUID | None = None
    connected_at: datetime | None = None
    pending_state: str | None = None
    pending_state_expires_at: datetime | None = None
    sheets: list[ConnectedSheet] = Field(default_factory=list)

    class Settings:
        name = "google_sheet_connections"
        indexes = [IndexModel([("created_at", 1)])]
