"""HTTP routes for the Marketing Board's Google Sheets integration."""
import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

from app.config.settings import settings
from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse
from app.schemas.google_sheets_schema import (
    AuthUrlResponse,
    FetchTabsRequest,
    GoogleCredentialsResponse,
    GoogleSheetsStatusResponse,
    SyncResultResponse,
    UpdateCredentialsRequest,
)
from app.services.google_sheets_service import GoogleSheetsService

logger = logging.getLogger("app.integrations.google_sheets")

router = APIRouter(prefix="/integrations/google-sheets", tags=["Marketing Board / Google Sheets"])


@router.get("/credentials", response_model=GoogleCredentialsResponse)
async def get_credentials(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> GoogleCredentialsResponse:
    return await GoogleSheetsService().get_credentials()


@router.put("/credentials", response_model=GoogleCredentialsResponse)
async def update_credentials(
    payload: UpdateCredentialsRequest,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> GoogleCredentialsResponse:
    return await GoogleSheetsService().update_credentials(payload)


@router.get("/status", response_model=GoogleSheetsStatusResponse)
async def get_status(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> GoogleSheetsStatusResponse:
    return await GoogleSheetsService().status()


@router.get("/auth-url", response_model=AuthUrlResponse)
async def get_auth_url(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> AuthUrlResponse:
    url = await GoogleSheetsService().get_auth_url(actor_id=actor.id)
    return AuthUrlResponse(url=url)


@router.get("/callback")
async def oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    # Google redirects the raw browser here — no Authorization header is
    # available, so the OAuth `state` param is what proves this callback
    # corresponds to an auth-url we issued (see GoogleSheetsService.get_auth_url).
    if error or not code or not state:
        return RedirectResponse(f"{settings.FRONTEND_URL}/marketing-board?google=error")

    try:
        await GoogleSheetsService().handle_callback(code=code, state=state, actor_id=None)
    except Exception:
        logger.exception("google_oauth_callback_failed")
        return RedirectResponse(f"{settings.FRONTEND_URL}/marketing-board?google=error")

    return RedirectResponse(f"{settings.FRONTEND_URL}/marketing-board?google=connected")


@router.post("/fetch-tabs")
async def fetch_tabs(
    payload: FetchTabsRequest,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
):
    return await GoogleSheetsService().fetch_tabs(payload.url)


@router.post("/sync", response_model=SyncResultResponse)
async def sync_now(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> SyncResultResponse:
    sheets, created = await GoogleSheetsService().sync_all()
    return SyncResultResponse(sheets=sheets, leads_created=created)


@router.delete("", response_model=MessageResponse)
async def disconnect(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> MessageResponse:
    await GoogleSheetsService().disconnect()
    return MessageResponse(message="Google Sheets disconnected.")


@router.delete("/sheets/{spreadsheet_id}", response_model=MessageResponse)
async def remove_sheet(
    spreadsheet_id: str,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> MessageResponse:
    await GoogleSheetsService().remove_sheet(spreadsheet_id)
    return MessageResponse(message="Sheet removed.")
