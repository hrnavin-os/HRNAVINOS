"""Request/response DTOs for the Invoice module."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import InvoiceStatus


class InvoiceCreate(BaseModel):
    student_id: uuid.UUID
    admission_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    due_date: date
    description: str | None = Field(default=None, max_length=255)


class InvoiceUpdate(BaseModel):
    due_date: date | None = None
    description: str | None = Field(default=None, max_length=255)
    status: InvoiceStatus | None = None


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    admission_id: uuid.UUID | None
    invoice_number: str
    amount: Decimal
    amount_paid: Decimal
    due_date: date
    description: str | None
    status: InvoiceStatus
    created_at: datetime

    model_config = {"from_attributes": True}
