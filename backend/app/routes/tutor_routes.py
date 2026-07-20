"""HTTP routes for the Tutor Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.tutor_schema import TutorCreate, TutorResponse, TutorUpdate
from app.services.tutor_service import TutorService

router = APIRouter(prefix="/tutors", tags=["Tutor Management"])


@router.post("", response_model=TutorResponse, status_code=status.HTTP_201_CREATED)
def create_tutor(
    payload: TutorCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_CREATE)),
) -> TutorResponse:
    return TutorResponse.model_validate(TutorService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[TutorResponse])
def list_tutors(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_VIEW)),
) -> PaginatedResponse[TutorResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = TutorService(db).list(params)
    return PaginatedResponse[TutorResponse].build(
        [TutorResponse.model_validate(t) for t in result.items], result.total, result.page, result.page_size
    )


@router.get("/{tutor_id}", response_model=TutorResponse)
def get_tutor(
    tutor_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_VIEW)),
) -> TutorResponse:
    return TutorResponse.model_validate(TutorService(db).get(tutor_id))


@router.put("/{tutor_id}", response_model=TutorResponse)
def update_tutor(
    tutor_id: uuid.UUID,
    payload: TutorUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_UPDATE)),
) -> TutorResponse:
    return TutorResponse.model_validate(TutorService(db).update(tutor_id, payload, actor_id=actor.id))


@router.delete("/{tutor_id}", response_model=MessageResponse)
def delete_tutor(
    tutor_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.TUTORS_DELETE)),
) -> MessageResponse:
    TutorService(db).delete(tutor_id, actor_id=actor.id)
    return MessageResponse(message="Tutor deleted successfully.")
