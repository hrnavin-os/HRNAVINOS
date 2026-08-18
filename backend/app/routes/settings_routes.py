"""HTTP routes for the (singleton) app Settings module."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions, RequireRoles
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.settings_schema import (
    ResetLeadsRequest,
    ResetLeadsResponse,
    SettingsResponse,
    SettingsUpdate,
)
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


@router.post("/reset-leads", response_model=ResetLeadsResponse)
async def reset_leads(
    payload: ResetLeadsRequest,
    # Role, not permission. Every other endpoint here gates on a permission
    # code so roles stay configurable, but this one empties the pipeline the
    # whole product is about - it should not become reachable by ticking a box
    # on some role's permission list. Super Admin bypasses permission checks
    # anyway, so a code would not have restricted it any further.
    actor: User = Depends(RequireRoles("Super Admin")),
) -> ResetLeadsResponse:
    """Clears every Foundation lead, its batch allocations, and the induction
    links that pointed at them.

    Soft delete: recoverable in the database, and gone everywhere in the app.
    Requires an exact confirmation phrase in the body, so this cannot fire from
    a stray or replayed POST with nothing in it.
    """
    return ResetLeadsResponse(
        **await SettingsService().reset_leads(payload.confirm, actor_id=actor.id)
    )
