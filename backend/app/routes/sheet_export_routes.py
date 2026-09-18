"""HTTP routes for the Sheet Export settings page.

The export runs on its own every `interval_seconds`; these exist to point it
at a spreadsheet, to see whether it is healthy, and to push the boards through
without waiting for the next run.
"""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.exceptions.base import BadRequestError, ConflictError
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.sheet_export_schema import SheetExportResponse, SheetExportUpdate
from app.services.sheet_export_service import SheetExportService

router = APIRouter(prefix="/integrations/sheet-export", tags=["Settings / Google Sheets export"])


@router.get("", response_model=SheetExportResponse)
async def get_sheet_export(
    actor: User = Depends(RequirePermissions(Permissions.SHEET_EXPORT_VIEW)),
) -> SheetExportResponse:
    return await SheetExportService().status()


@router.put("", response_model=SheetExportResponse)
async def update_sheet_export(
    payload: SheetExportUpdate,
    actor: User = Depends(RequirePermissions(Permissions.SHEET_EXPORT_UPDATE)),
) -> SheetExportResponse:
    service = SheetExportService()
    await service.update(payload, actor_id=actor.id)
    # The whole status back, not just the saved fields: changing the link
    # changes what the page has to say about readiness and the tabs.
    return await service.status()


@router.post("/run", response_model=SheetExportResponse)
async def run_now(
    actor: User = Depends(RequirePermissions(Permissions.SHEET_EXPORT_UPDATE)),
) -> SheetExportResponse:
    service = SheetExportService()
    config = await service.get()
    if not config.spreadsheet_id:
        raise BadRequestError("Paste the Google Sheets link first, then run the export.")
    if not config.enabled:
        raise BadRequestError("The export is turned off. Turn it on, then run it.")
    if not await service.run(force=True):
        raise ConflictError("An export is already running - try again in a few seconds.")
    return await service.status()
