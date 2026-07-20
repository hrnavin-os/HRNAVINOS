"""Request/response DTOs for the Admissions module."""
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import AdmissionStatus


class AdmissionCreate(BaseModel):
    lead_id: uuid.UUID | None = None
    student_id: uuid.UUID
    course_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    total_fee: Decimal = Field(gt=0)
    admission_fee_paid: Decimal = Field(default=Decimal("0"), ge=0)


class AdmissionUpdate(BaseModel):
    batch_id: uuid.UUID | None = None
    total_fee: Decimal | None = Field(default=None, gt=0)
    admission_fee_paid: Decimal | None = Field(default=None, ge=0)
    status: AdmissionStatus | None = None


class AdmissionResponse(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID | None
    student_id: uuid.UUID
    course_id: uuid.UUID
    batch_id: uuid.UUID | None
    total_fee: Decimal
    admission_fee_paid: Decimal
    status: AdmissionStatus
    admitted_by: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
