"""Request/response DTOs for the Marketing Board's Google Sheets integration."""
from datetime import datetime

from pydantic import BaseModel, Field


class SheetTabResponse(BaseModel):
    name: str
    row_count: int


class ConnectedSheetResponse(BaseModel):
    id: str
    url: str
    name: str
    tabs: list[SheetTabResponse]
    last_sync_at: datetime | None


class GoogleSheetsStatusResponse(BaseModel):
    connected: bool
    sheets: list[ConnectedSheetResponse]


class AuthUrlResponse(BaseModel):
    url: str


class FetchTabsRequest(BaseModel):
    url: str = Field(min_length=1)


class SyncResultResponse(BaseModel):
    sheets: list[ConnectedSheetResponse]
    leads_created: int


class GoogleCredentialsResponse(BaseModel):
    client_id: str | None
    redirect_uri: str
    source: str  # "database" | "environment" | "none"


class UpdateCredentialsRequest(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str | None = None
    redirect_uri: str = Field(min_length=1)
