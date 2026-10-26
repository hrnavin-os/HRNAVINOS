"""Public (unauthenticated) routes behind a student's private link.

Students don't have logins. The token in their link (/s/<token>) is the only
thing that identifies them, so every route here is keyed on it and answers
for that one student alone. Rate-limited like the public forms: it is
reachable by anyone who has the link, or is guessing at one.
"""
import uuid

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.config.settings import settings
from app.middleware.rate_limiter import limiter
from app.schemas.student_portal_schema import PublicPortalResponse, RecordingLinkResponse
from app.services.student_portal_service import StudentPortalService

router = APIRouter(prefix="/public/student-portal", tags=["Student Portal (Public)"])


@router.get("/{token}", response_model=PublicPortalResponse)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def get_student_page(request: Request, token: str) -> PublicPortalResponse:
    return await StudentPortalService().public_view(token)


@router.post("/{token}/terms", response_model=PublicPortalResponse)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def accept_terms(
    request: Request,
    token: str,
    signed_name: str = Form(min_length=1, max_length=150),
    agreed: bool = Form(default=False),
    file: UploadFile | None = File(default=None),
) -> PublicPortalResponse:
    service = StudentPortalService()
    await service.accept_terms(
        token,
        signed_name=signed_name,
        agreed=agreed,
        file=file,
        ip=request.client.host if request.client else None,
    )
    return await service.public_view(token)


@router.post("/{token}/classes/{session_id}/recording", response_model=RecordingLinkResponse)
@limiter.limit(settings.RATE_LIMIT_PUBLIC_FORM)
async def open_recording(request: Request, token: str, session_id: uuid.UUID) -> RecordingLinkResponse:
    return RecordingLinkResponse(url=await StudentPortalService().open_recording(token, session_id))
