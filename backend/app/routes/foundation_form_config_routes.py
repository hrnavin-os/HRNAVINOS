"""Admin HTTP routes for editing the Foundation Form's fields, offer text,
and program/pricing config. Gated by the same Leads permission the admin
page (/leads/foundation-form) already requires - no dedicated permission
code exists for this feature, matching how narrowly-scoped it is."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.foundation_form_schema import FoundationFormConfigResponse, FoundationFormConfigUpdate
from app.services.foundation_form_config_service import FoundationFormConfigService

router = APIRouter(prefix="/foundation-form/config", tags=["Foundation Form (Admin Config)"])


def _to_response(config) -> FoundationFormConfigResponse:
    # config.fields/programs/categories are FoundationFormField/ProgramCfg/Category
    # model instances (from app.models.foundation_form_config) - a different class
    # than the FoundationFormFieldConfig/etc. response schema types, even though
    # the field names match. Pydantic v2 won't auto-coerce one model instance into
    # another; model_dump() to plain dicts first so validation has something it
    # actually knows how to build the response schema from.
    return FoundationFormConfigResponse(
        offer_info=config.offer_info,
        fields=[f.model_dump() for f in config.fields],
        programs=[p.model_dump() for p in config.programs],
        categories=[c.model_dump() for c in config.categories],
        updated_at=config.updated_at,
    )


@router.get("", response_model=FoundationFormConfigResponse)
async def get_foundation_form_config(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> FoundationFormConfigResponse:
    config = await FoundationFormConfigService().get_config()
    return _to_response(config)


@router.put("", response_model=FoundationFormConfigResponse)
async def update_foundation_form_config(
    payload: FoundationFormConfigUpdate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> FoundationFormConfigResponse:
    config = await FoundationFormConfigService().update_config(payload, actor_id=actor.id)
    return _to_response(config)
