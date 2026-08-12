"""Request/response DTOs for the Batch Confirmation module (HR Coordinator)."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import AllocationStatus, BatchStatus, LeadStatus, WhatsAppGroupStatus


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


class BulkGroupAssignRequest(BaseModel):
    lead_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class BulkGroupAssignResponse(BaseModel):
    message: str
    assigned: int
    skipped: list[str] = []


class WhatsAppInviteResponse(BaseModel):
    student: "HRStudentResponse"
    # True when the Cloud API sent the message. False means the board should
    # fall back to opening a pre-written wa.me link - either the credentials
    # aren't configured or Meta refused the send.
    delivered: bool


class WhatsAppConfigResponse(BaseModel):
    """Whether automatic sending is available, so the board can say which mode
    it's in before anybody presses anything."""

    configured: bool


class WhatsAppHistoryEntry(BaseModel):
    action: str
    user_name: str | None
    created_at: datetime


class WhatsAppCountsResponse(BaseModel):
    """One count per status plus the total, for the board's filter chips."""

    all: int
    not_invited: int
    invite_sent: int
    joined: int
    follow_up_required: int


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
    # The pipeline stage behind the tab, so the detail popup can work out
    # which moves are allowed rather than re-deriving it from the tab.
    status: LeadStatus
    # What the coordinator typed in by hand, kept for leads that never came
    # through Induction and for rows entered before batch became automatic.
    batch_number: str | None
    # The batch this student actually belongs to. Derived from their induction
    # entry's registration month, which is where the number comes from in the
    # first place - the coordinator was re-typing a value the system already
    # knew, and any typo silently disagreed with the Induction board. Falls
    # back to batch_number when there's no induction record to read.
    batch: str | None = None
    # Stored as group_assigned_at; renamed here because "when they joined" is
    # what it means and what the board shows.
    group_assigned_at: datetime | None
    joined_at: datetime | None = None
    # Derived from the timestamps below - see Lead.whatsapp_status. An invite
    # having been sent is never reported as a join.
    whatsapp_status: WhatsAppGroupStatus = WhatsAppGroupStatus.NOT_INVITED
    whatsapp_invite_sent_at: datetime | None = None
    whatsapp_invite_count: int = 0
    whatsapp_last_follow_up_at: datetime | None = None
    whatsapp_handled_by_name: str | None = None
    # Set when Finance flagged this student as not having paid. Carried on the
    # row as well as in the notification, since a notification is read once by
    # one person and the board has to keep showing the flag afterwards.
    non_payment_reported_at: datetime | None = None
    non_payment_amount: Decimal | None = None
    lost_reason: str | None
    lost_at: datetime | None
    created_at: datetime


class BatchNumberRequest(BaseModel):
    batch_number: str = Field(default="", max_length=50)


class GroupAssignRequest(BaseModel):
    # False clears the assignment, sending the student back to the
    # "Approved by Finance" queue.
    assigned: bool = True


class HRStageRequest(BaseModel):
    status: LeadStatus
    # Required by LeadService.update when the move is to Lost.
    lost_reason: str | None = Field(default=None, max_length=500)


# HRStudentResponse is declared below the response that references it, so the
# forward reference has to be resolved once the real class exists.
WhatsAppInviteResponse.model_rebuild()
