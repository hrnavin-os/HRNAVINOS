"""Request/response DTOs for the Payment module."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import PaymentMethod, PaymentStatus


class PaymentCreate(BaseModel):
    student_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    payment_date: date
    method: PaymentMethod
    reference_number: str | None = Field(default=None, max_length=100)


class PaymentVerify(BaseModel):
    approve: bool
    rejection_reason: str | None = Field(default=None, max_length=255)


class PaymentResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    invoice_id: uuid.UUID | None
    amount: Decimal
    payment_date: date
    method: PaymentMethod
    reference_number: str | None
    status: PaymentStatus
    verified_by: uuid.UUID | None
    verified_at: datetime | None
    rejection_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
