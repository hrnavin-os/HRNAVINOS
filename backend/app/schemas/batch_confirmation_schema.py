"""Request/response DTOs for the Batch Confirmation module (HR Coordinator)."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import AllocationStatus, BatchStatus


class AllocateRequest(BaseModel):
    lead_id: uuid.UUID
    batch_id: uuid.UUID
    notes: str | None = Field(default=None, max_length=1000)


class WithdrawRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PendingLeadResponse(BaseModel):
    """A lead sitting at the Batch Confirmation stage with no live seat yet."""

    id: uuid.UUID
    name: str
    email: str | None
    phone: str
    course_interest: str | None
    batch_preference: str | None
    section: str | None
    # Whether every installment on the lead's payment plan is marked paid.
    # Leads with no plan at all count as unpaid - nothing has been collected.
    fully_paid: bool
    paid_installments: int
    total_installments: int
    created_at: datetime


class AllocatedLeadResponse(BaseModel):
    """One occupied seat on a batch roster."""

    allocation_id: uuid.UUID
    lead_id: uuid.UUID
    name: str
    email: str | None
    phone: str
    status: AllocationStatus
    fully_paid: bool
    notes: str | None
    allocated_at: datetime


class ReadinessCheck(BaseModel):
    """One pass/fail gate on the path to confirming a batch."""

    code: str
    label: str
    passed: bool
    detail: str


class BatchReadinessResponse(BaseModel):
    batch_id: uuid.UUID
    batch_name: str
    course_id: uuid.UUID
    course_name: str | None
    tutor_id: uuid.UUID | None
    tutor_name: str | None
    start_date: date
    end_date: date
    schedule: str | None
    capacity: int
    status: BatchStatus
    allocated_count: int
    paid_count: int
    seats_remaining: int
    fill_percent: int
    checks: list[ReadinessCheck]
    # True only when every check passes; the confirm endpoint refuses otherwise.
    can_confirm: bool


class BatchReadinessDetailResponse(BatchReadinessResponse):
    allocations: list[AllocatedLeadResponse]


class ConfirmBatchResponse(BaseModel):
    batch_id: uuid.UUID
    batch_name: str
    status: BatchStatus
    students_created: int
    admissions_created: int
    message: str


class CoordinatorSummaryResponse(BaseModel):
    """Headline counters for the dashboard's stat cards."""

    pending_allocation: int
    allocated_awaiting_confirmation: int
    batches_ready_to_confirm: int
    batches_confirmed: int
    students_placed: int
