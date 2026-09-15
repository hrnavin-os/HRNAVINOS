"""Status and manual trigger for the Lead Dashboard <-> Google Sheet sync.

The sync runs on its own every LEAD_SHEET_SYNC_INTERVAL_SECONDS; these exist
to see whether it is healthy and to push a change through without waiting.
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config.settings import settings
from app.core.dependencies import RequirePermissions
from app.exceptions.base import BadRequestError, ConflictError
from app.models.lead_sheet_sync import LeadSheetTabStats
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.services.google_sheets_client import service_account_email
from app.services.lead_sheet_sync_service import LeadSheetSyncService

router = APIRouter(prefix="/integrations/lead-sheet-sync", tags=["Lead Dashboard / Google Sheet sync"])


class LeadSheetSyncStatusResponse(BaseModel):
    enabled: bool
    spreadsheet_url: str | None
    induction_tab: str
    foundation_tab: str
    interval_seconds: int
    # The address to share the spreadsheet with, when a service account is set.
    service_account_email: str | None
    credential: str | None
    running: bool
    last_success_at: datetime | None
    last_finished_at: datetime | None
    next_run_at: datetime | None
    last_error: str | None
    tabs: dict[str, LeadSheetTabStats]


async def _status() -> LeadSheetSyncStatusResponse:
    state = await LeadSheetSyncService().state()
    spreadsheet_id = settings.LEAD_SHEET_SPREADSHEET_ID
    return LeadSheetSyncStatusResponse(
        enabled=settings.lead_sheet_sync_enabled,
        spreadsheet_url=f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit" if spreadsheet_id else None,
        induction_tab=settings.LEAD_SHEET_INDUCTION_TAB,
        foundation_tab=settings.LEAD_SHEET_FOUNDATION_TAB,
        interval_seconds=settings.LEAD_SHEET_SYNC_INTERVAL_SECONDS,
        service_account_email=service_account_email(),
        credential=state.credential,
        running=bool(state.running_until),
        last_success_at=state.last_success_at,
        last_finished_at=state.last_finished_at,
        next_run_at=state.next_run_at,
        last_error=state.last_error,
        tabs=state.tabs,
    )


@router.get("/status", response_model=LeadSheetSyncStatusResponse)
async def get_status(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> LeadSheetSyncStatusResponse:
    return await _status()


@router.post("/run", response_model=LeadSheetSyncStatusResponse)
async def run_now(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadSheetSyncStatusResponse:
    if not settings.lead_sheet_sync_enabled:
        raise BadRequestError(
            "Sheet sync is turned off on this server. Set LEAD_SHEET_SYNC_ENABLED=true (it is on by default "
            "only when APP_ENV=production)."
        )
    if not await LeadSheetSyncService().run(force=True):
        raise ConflictError("A sync is already running - try again in a few seconds.")
    return await _status()
