"""HTTP routes for the Batch Management module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.batch_schema import BatchCreate, BatchResponse, BatchUpdate
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.services.batch_service import BatchService

router = APIRouter(prefix="/batches", tags=["Batch Management"])


@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
def create_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_CREATE)),
) -> BatchResponse:
    return BatchResponse.model_validate(BatchService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[BatchResponse])
def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    course_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_VIEW)),
) -> PaginatedResponse[BatchResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    result = BatchService(db).list(params, course_id=course_id)
    return PaginatedResponse[BatchResponse].build(
        [BatchResponse.model_validate(b) for b in result.items], result.total, result.page, result.page_size
    )


@router.get("/{batch_id}", response_model=BatchResponse)
def get_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_VIEW)),
) -> BatchResponse:
    return BatchResponse.model_validate(BatchService(db).get(batch_id))


@router.put("/{batch_id}", response_model=BatchResponse)
def update_batch(
    batch_id: uuid.UUID,
    payload: BatchUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_UPDATE)),
) -> BatchResponse:
    return BatchResponse.model_validate(BatchService(db).update(batch_id, payload, actor_id=actor.id))


@router.delete("/{batch_id}", response_model=MessageResponse)
def delete_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.BATCHES_DELETE)),
) -> MessageResponse:
    BatchService(db).delete(batch_id, actor_id=actor.id)
    return MessageResponse(message="Batch deleted successfully.")
