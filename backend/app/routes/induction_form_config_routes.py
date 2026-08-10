"""Admin routes for editing the Induction Call Form's questions and dropdowns."""
from fastapi import APIRouter, Depends

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.induction_form_config_schema import (
    InductionFormConfigResponse,
    InductionFormConfigUpdate,
)
from app.services.induction_form_config_service import InductionFormConfigService

router = APIRouter(prefix="/induction-form/config", tags=["Induction Form Config"])


def _to_response(config) -> InductionFormConfigResponse:
    # config.fields are InductionFormField documents, a different class to the
    # response schema even though the names line up; Pydantic v2 won't coerce
    # one model into another, so dump to plain dicts first.
    return InductionFormConfigResponse(
        fields=[field.model_dump() for field in sorted(config.fields, key=lambda f: f.order)],
        updated_at=config.updated_at,
    )


@router.get("", response_model=InductionFormConfigResponse)
async def get_induction_form_config(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> InductionFormConfigResponse:
    return _to_response(await InductionFormConfigService().get_config())


@router.put("", response_model=InductionFormConfigResponse)
async def update_induction_form_config(
    payload: InductionFormConfigUpdate,
    actor: User = Depends(RequirePermissions(Permissions.FORM_COLLECTION_CONFIGURE)),
) -> InductionFormConfigResponse:
    config = await InductionFormConfigService().update_config(payload, actor_id=actor.id)
    return _to_response(config)
