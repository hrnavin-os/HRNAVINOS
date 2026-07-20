"""HTTP routes for the Payment / Finance Verification module."""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import RequirePermissions
from app.database.session import get_db
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.payment_schema import PaymentCreate, PaymentResponse, PaymentVerify
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments / Finance"])


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_CREATE)),
) -> PaymentResponse:
    return PaymentResponse.model_validate(PaymentService(db).create(payload, actor_id=actor.id))


@router.get("", response_model=PaginatedResponse[PaymentResponse])
def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    student_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_VIEW)),
) -> PaginatedResponse[PaymentResponse]:
    params = PaginationParams(page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order)
    result = PaymentService(db).list(params, status=status_filter, student_id=student_id)
    return PaginatedResponse[PaymentResponse].build(
        [PaymentResponse.model_validate(p) for p in result.items], result.total, result.page, result.page_size
    )


@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_VIEW)),
) -> PaymentResponse:
    return PaymentResponse.model_validate(PaymentService(db).get(payment_id))


@router.post("/{payment_id}/verify", response_model=PaymentResponse)
def verify_payment(
    payment_id: uuid.UUID,
    payload: PaymentVerify,
    db: Session = Depends(get_db),
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_VERIFY)),
) -> PaymentResponse:
    return PaymentResponse.model_validate(PaymentService(db).verify(payment_id, payload, actor_id=actor.id))
