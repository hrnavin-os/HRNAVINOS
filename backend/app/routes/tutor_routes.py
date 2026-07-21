"""HTTP routes for the Tutor Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import RequirePermissions
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.tutor_schema import TutorCreate, TutorResponse, TutorUpdate
from app.services.tutor_service import TutorService

router = APIRouter(prefix="/tutors", tags=["Tutor Management"])


@router.post("", response_model=TutorResponse, status_code=status.HTTP_201_CREATED)
async def create_tutor(
    payload: TutorCreate,
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_CREATE)),
) -> TutorResponse:
    return TutorResponse.model_validate(await TutorService().create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[TutorResponse])
async def list_tutors(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_VIEW)),
) -> PaginatedResponse[TutorResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = await TutorService().list(params)
    return PaginatedResponse[TutorResponse].build(
        [TutorResponse.model_validate(t) for t in result.items], result.total, result.page, result.page_size
    )


@router.get("/{tutor_id}", response_model=TutorResponse)
async def get_tutor(
    tutor_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_VIEW)),
) -> TutorResponse:
    return TutorResponse.model_validate(await TutorService().get(tutor_id))


@router.put("/{tutor_id}", response_model=TutorResponse)
async def update_tutor(
    tutor_id: uuid.UUID,
    payload: TutorUpdate,
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_UPDATE)),
) -> TutorResponse:
    return TutorResponse.model_validate(await TutorService().update(tutor_id, payload, actor_id=actor.id))


@router.delete("/{tutor_id}", response_model=MessageResponse)
async def delete_tutor(
    tutor_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_DELETE)),
) -> MessageResponse:
    await TutorService().delete(tutor_id, actor_id=actor.id)
    return MessageResponse(message="Tutor deleted successfully.")
