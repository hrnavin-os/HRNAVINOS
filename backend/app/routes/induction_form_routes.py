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
from app.services.induction_entry_service import InductionEntryService

router = APIRouter(prefix="/public/induction-form", tags=["Induction Form (Public)"])


@router.post("/submit", response_model=InductionFormSubmitResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def submit_induction_form(request: Request, payload: InductionEntryCreate) -> InductionFormSubmitResponse:
    # actor_id is None: nobody is logged in, so the entry records no creator.
    await InductionEntryService().create(payload, actor_id=None)
    return InductionFormSubmitResponse(message="Thank you! The details have been submitted successfully.")
