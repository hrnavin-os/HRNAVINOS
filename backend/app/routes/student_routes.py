"""HTTP routes for the Student Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.student_schema import StudentCreate, StudentResponse, StudentUpdate
from app.services.student_service import StudentService

router = APIRouter(prefix="/students", tags=["Student Management"])


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.STUDENTS_CREATE)),
) -> StudentResponse:
    return StudentResponse.model_validate(StudentService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[StudentResponse])
def list_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    batch_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.STUDENTS_VIEW)),
) -> PaginatedResponse[StudentResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = StudentService(db).list(params, batch_id=batch_id)
    return PaginatedResponse[StudentResponse].build(
        [StudentResponse.model_validate(s) for s in result.items], result.total, result.page, result.page_size
    )


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.STUDENTS_VIEW)),
) -> StudentResponse:
    return StudentResponse.model_validate(StudentService(db).get(student_id))


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: uuid.UUID,
    payload: StudentUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.STUDENTS_UPDATE)),
) -> StudentResponse:
    return StudentResponse.model_validate(StudentService(db).update(student_id, payload, actor_id=actor.id))


@router.delete("/{student_id}", response_model=MessageResponse)
def delete_student(
    student_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.STUDENTS_DELETE)),
) -> MessageResponse:
    StudentService(db).delete(student_id, actor_id=actor.id)
    return MessageResponse(message="Student deleted successfully.")
