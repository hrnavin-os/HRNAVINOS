"""HTTP routes for the Admissions module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.admission_schema import AdmissionCreate, AdmissionResponse, AdmissionUpdate
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.services.admission_service import AdmissionService

router = APIRouter(prefix="/admissions", tags=["Admissions"])


@router.post("", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
def create_admission(
    payload: AdmissionCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ADMISSIONS_CREATE)),
) -> AdmissionResponse:
    return AdmissionResponse.model_validate(AdmissionService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[AdmissionResponse])
def list_admissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    student_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ADMISSIONS_VIEW)),
) -> PaginatedResponse[AdmissionResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = AdmissionService(db).list(params, student_id=student_id)
    return PaginatedResponse[AdmissionResponse].build(
        [AdmissionResponse.model_validate(a) for a in result.items], result.total, result.page, result.page_size
    )


@router.get("/{admission_id}", response_model=AdmissionResponse)
def get_admission(
    admission_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ADMISSIONS_VIEW)),
) -> AdmissionResponse:
    return AdmissionResponse.model_validate(AdmissionService(db).get(admission_id))


@router.put("/{admission_id}", response_model=AdmissionResponse)
def update_admission(
    admission_id: uuid.UUID,
    payload: AdmissionUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ADMISSIONS_UPDATE)),
) -> AdmissionResponse:
    return AdmissionResponse.model_validate(AdmissionService(db).update(admission_id, payload, actor_id=actor.id))


@router.delete("/{admission_id}", response_model=MessageResponse)
def delete_admission(
    admission_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.ADMISSIONS_DELETE)),
) -> MessageResponse:
    AdmissionService(db).delete(admission_id, actor_id=actor.id)
    return MessageResponse(message="Admission deleted successfully.")
