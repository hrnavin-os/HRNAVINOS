"""Public (unauthenticated) HTTP routes for the Foundation Form.

Shared as a plain link with prospective students - no login, no
permission checks. Rate-limited since it's reachable by anyone.
"""
from fastapi import APIRouter, Request, status

from app.config.settings import settings
from app.middleware.rate_limiter import limiter
from app.schemas.foundation_form_schema import (
    FoundationFormPricingResponse,
    FoundationFormSubmit,
    FoundationFormSubmitResponse,
)
from app.services.foundation_form_service import FoundationFormService

router = APIRouter(prefix="/public/foundation-form", tags=["Foundation Form (Public)"])


@router.get("/pricing", response_model=FoundationFormPricingResponse)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def get_pricing(request: Request) -> FoundationFormPricingResponse:
    return await FoundationFormService().get_pricing()


@router.post("/submit", response_model=FoundationFormSubmitResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def submit_foundation_form(request: Request, payload: FoundationFormSubmit) -> FoundationFormSubmitResponse:
    await FoundationFormService().submit(payload)
    return FoundationFormSubmitResponse(message="Thank you! Your details have been submitted successfully.")
