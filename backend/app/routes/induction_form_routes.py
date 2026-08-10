"""Public (unauthenticated) route for the Induction Call Form.

Shared as a plain link so whoever is collecting the details can fill it in
from anywhere - no login, no permission checks. Rate-limited for the same
reason the Foundation Form's public route is: it's reachable by anyone.

Submitting runs the same round-robin assignment as creating an entry from
inside the ERP, so a form fill lands on a Section Admin exactly like a
hand-keyed one does.
"""
from fastapi import APIRouter, Request, status

from app.config.settings import settings
from app.middleware.rate_limiter import limiter
from app.schemas.induction_entry_schema import InductionEntryCreate, InductionFormSubmitResponse
from app.schemas.induction_form_config_schema import InductionFormConfigResponse
from app.services.induction_entry_service import InductionEntryService
from app.services.induction_form_config_service import InductionFormConfigService

router = APIRouter(prefix="/public/induction-form", tags=["Induction Form (Public)"])


@router.get("/config", response_model=InductionFormConfigResponse)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def get_public_config(request: Request) -> InductionFormConfigResponse:
    """What questions to render. Public because the form itself is - it has to
    be able to describe itself before anyone has logged in."""
    config = await InductionFormConfigService().get_config()
    return InductionFormConfigResponse(
        fields=[field.model_dump() for field in sorted(config.fields, key=lambda f: f.order)],
        updated_at=config.updated_at,
    )


@router.post("/submit", response_model=InductionFormSubmitResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def submit_induction_form(request: Request, payload: InductionEntryCreate) -> InductionFormSubmitResponse:
    # actor_id is None: nobody is logged in, so the entry records no creator.
    await InductionEntryService().create(payload, actor_id=None)
    return InductionFormSubmitResponse(message="Thank you! The details have been submitted successfully.")
