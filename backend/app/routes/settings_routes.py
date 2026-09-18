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
    """Clears the Induction board, the Foundation board, or both.

    Soft delete: recoverable in the database, and gone everywhere in the app.
    Requires the confirmation phrase for the chosen scope in the body, so this
    cannot fire from a stray or replayed POST with nothing in it - nor from a
    request that names one board while carrying the phrase for another.
    """
    return ResetLeadsResponse(
        **await SettingsService().reset_leads(
            payload.confirm, scope=payload.scope, actor_id=actor.id
        )
    )
