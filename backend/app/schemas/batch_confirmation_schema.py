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
    hr_marked: bool
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


class MarkRequest(BaseModel):
    marked: bool


class AllocationRowResponse(BaseModel):
    """A seat listed on its own, carrying the batch it belongs to.

    Backs the dashboard's Allocated and Total Students views, which show seats
    across every batch rather than one batch's roster.
    """

    allocation_id: uuid.UUID
    lead_id: uuid.UUID
    name: str
    email: str | None
    phone: str
    course_interest: str | None
    batch_id: uuid.UUID
    batch_name: str
    status: AllocationStatus
    fully_paid: bool
    student_id: uuid.UUID | None
    allocated_at: datetime
    confirmed_at: datetime | None


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


class OptionItem(BaseModel):
    id: uuid.UUID
    label: str
    detail: str | None = None


class BatchFormOptionsResponse(BaseModel):
    """Course and tutor pickers for the coordinator's own batch form.

    Served from this module rather than read off /tutors directly, because
    TutorResponse carries only user_id - resolving a tutor's name needs
    users.view, which the HR Coordinator role deliberately doesn't hold.
    """

    courses: list[OptionItem]
    tutors: list[OptionItem]


class CoordinatorSummaryResponse(BaseModel):
    """Headline counters for the dashboard's stat cards."""

    pending_allocation: int
    allocated_awaiting_confirmation: int
    batches_ready_to_confirm: int
    batches_confirmed: int
    students_placed: int


class HRStudentResponse(BaseModel):
    """One row in any of the four HR Coordinator tabs. A single shape across
    all of them - each tab just renders the subset of columns it cares about,
    so a student keeps their details as they move between tabs."""

    id: uuid.UUID
    name: str
    email: str | None
    phone: str
    course_interest: str | None
    section: str | None
    batch_number: str | None
    group_assigned_at: datetime | None
    lost_reason: str | None
    lost_at: datetime | None
    created_at: datetime


class BatchNumberRequest(BaseModel):
    batch_number: str = Field(default="", max_length=50)
