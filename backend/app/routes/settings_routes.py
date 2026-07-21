"""HTTP routes for the (singleton) app Settings module."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.settings_schema import SettingsResponse, SettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings(
    actor: User = Depends(RequirePermissions(Permissions.SETTINGS_VIEW)),
) -> SettingsResponse:
    return SettingsResponse.model_validate(await SettingsService().get())


@router.put("", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    actor: User = Depends(RequirePermissions(Permissions.SETTINGS_UPDATE)),
) -> SettingsResponse:
    return SettingsResponse.model_validate(await SettingsService().update(payload, actor_id=actor.id))
