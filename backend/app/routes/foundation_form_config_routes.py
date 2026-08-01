"""Admin HTTP routes for editing the Form Collection form's fields, offer
text, and program/pricing config. GET is gated by the same Leads permission
the admin page already requires (harmless to read); PUT requires the
dedicated FORM_COLLECTION_CONFIGURE permission, deliberately separate from
LEADS_UPDATE - Section Admins need LEADS_UPDATE to manage their own
section's leads, but must not be able to edit the shared form every section
uses."""
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
        sections=[s.model_dump() for s in config.sections],
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
    actor: User = Depends(RequirePermissions(Permissions.FORM_COLLECTION_CONFIGURE)),
) -> FoundationFormConfigResponse:
    config = await FoundationFormConfigService().update_config(payload, actor_id=actor.id)
    return _to_response(config)
