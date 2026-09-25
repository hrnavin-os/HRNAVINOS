"""Request/response DTOs for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import (
    InstallmentPaymentMode,
    LeadSource,
    LeadStatus,
    PaymentMethod,
    PaymentOption,
    PaymentPlanOption,
    PaymentTimeline,
)
from app.schemas.foundation_group_schema import FoundationGroupMoveSchema
from app.utils.foundation_groups import MAX_FOUNDATION_GROUP


class LeadCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str = Field(min_length=6, max_length=20)
    source: LeadSource = LeadSource.OTHER
    # Optional because the Create Lead form asks for the *program* instead, and
    # the service derives the course name from it (LeadService.create) - the
    # same way a Foundation Form submission does. Still accepted on its own for
    # a lead keyed against a bare course name with no program behind it.
    course_interest: str | None = Field(default=None, min_length=1, max_length=150)
    batch_preference: str | None = Field(default=None, max_length=150)
    payment_expected: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None
    section: str | None = None
    remarks: str | None = Field(default=None, max_length=2000)
    # The class group and batch, asked on the Create Lead form so a hand-keyed
    # lead doesn't land on the board with both columns empty. The same two
    # fields, and the same limits, as the board's Group and Batch cells write.
    foundation_group: int | None = Field(default=None, ge=1, le=MAX_FOUNDATION_GROUP)
    batch_number: str | None = Field(default=None, max_length=50)
    # The rest of the Foundation Form's questions, so a lead hand-keyed during
    # a call carries everything one submitted through the form does. Validated
    # against the live programs/pricing config in the service.
    program_interest: str | None = Field(default=None, max_length=50)
    payment_plan: PaymentPlanOption | None = None
    payment_timeline: PaymentTimeline | None = None
    # Answers to questions an admin added to the form beyond the built-in ones;
    # stored on the lead's raw_form_data, which is what Form Check reads back.
    custom_fields: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_plan_has_program(self) -> "LeadCreate":
        # A plan's amounts come from the chosen program's pricing category, so
        # a plan without one has nothing to price it - it would be stored as a
        # label with no installments behind it.
        if self.payment_plan is not None and self.program_interest is None:
            raise ValueError("A payment plan needs a program to price it.")
        return self


class LeadUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=6, max_length=20)
    source: LeadSource | None = None
    status: LeadStatus | None = None
    course_interest: str | None = Field(default=None, max_length=150)
    batch_preference: str | None = Field(default=None, max_length=150)
    payment_expected: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    follow_up_at: datetime | None = None
    paid_amount: Decimal | None = Field(default=None, ge=0)
    remarks: str | None = Field(default=None, max_length=2000)
    payment_option: PaymentOption | None = None
    payment_call_remarks: str | None = Field(default=None, max_length=100)
    paying_amount: Decimal | None = Field(default=None, ge=0)
    qr_code: str | None = Field(default=None, max_length=100)
    batch_number: str | None = Field(default=None, max_length=50)
    # Moving a student between foundation class groups, from the board's Group
    # cell. LeadService.update records where they came from.
    foundation_group: int | None = Field(default=None, ge=1, le=MAX_FOUNDATION_GROUP)
    # With a group change: True when the student belongs in the new group
    # outright rather than being moved there, so no "moved from" is shown.
    foundation_group_direct: bool | None = None
    # Required by LeadService.update whenever status moves to Lost.
    lost_reason: str | None = Field(default=None, max_length=500)
    # Required whenever status moves back to an earlier stage. Kept on the
    # timeline entry for the move rather than on the lead.
    stage_change_reason: str | None = Field(default=None, max_length=500)


class LeadRejoin(BaseModel):
    """A lost student coming back. The course is asked for rather than assumed:
    somebody who left and returned months later is often returning to a
    different one, and it is the single thing that has to be right for them to
    be worked correctly from here."""

    course_interest: str = Field(min_length=1, max_length=150)


class LeadRemarkCreate(BaseModel):
    # Optional so the common case - "what happened on the call I just made" -
    # is one field to fill in; the service dates it today when it is left out.
    remark_date: date | None = None
    text: str = Field(min_length=1, max_length=2000)


class LeadRemarkUpdate(BaseModel):
    remark_date: date | None = None
    text: str | None = Field(default=None, min_length=1, max_length=2000)


class LeadRemarkResponse(BaseModel):
    # None for the one synthetic entry the API surfaces for a lead whose only
    # remark predates dated remarks (see LeadService._remark_responses). It has
    # no stored entry to address, so the UI shows it read-only until the next
    # remark is added and it is migrated into a real, editable one.
    id: uuid.UUID | None = None
    remark_date: date
    text: str
    created_at: datetime
    created_by: uuid.UUID | None = None
    created_by_name: str | None = None
    updated_at: datetime | None = None


class LeadAssign(BaseModel):
    assigned_to: uuid.UUID


class LeadPlanAssign(BaseModel):
    # A Program.value; validated against the live programs collection in
    # LeadService.assign_plan() rather than by a closed enum here.
    program_interest: str = Field(min_length=1, max_length=50)
    payment_plan: PaymentPlanOption


class FollowUpEntryResponse(BaseModel):
    scheduled_at: datetime
    created_at: datetime


class PaymentInstallmentResponse(BaseModel):
    label: str
    amount: Decimal | None
    received_amount: Decimal | None = None
    mode: InstallmentPaymentMode | None
    qr_code: str | None = None
    transaction_id: str | None
    upi_id: str | None
    proof_url: str | None
    proof_urls: list[str] = []
    remarks: str | None = None
    scheduled_at: date | None
    paid: bool
    paid_at: date | None


class LeadResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr | None
    phone: str
    # The Induction Call Form entry this lead was matched to on mobile number,
    # and the flag the UI reads. `induction_matched` is derived from the id
    # rather than stored beside it so the two can never disagree - "unmatched"
    # is precisely "no induction entry has this number", nothing else.
    induction_entry_id: uuid.UUID | None = None
    induction_matched: bool = False
    source: LeadSource
    status: LeadStatus
    course_interest: str | None
    batch_preference: str | None
    payment_expected: str | None
    notes: str | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None = None
    follow_up_at: datetime | None
    follow_up_history: list[FollowUpEntryResponse] = []
    payment_image_url: str | None
    paid_amount: Decimal | None
    payment_mode: PaymentMethod | None
    reviewed: bool
    raw_form_data: dict[str, str] | None = None
    program_interest: str | None = None
    section: str | None = None
    remarks: str | None = None
    # Newest first. Carries the lead's whole remark history, so the board can
    # render it without a request per row.
    remark_entries: list[LeadRemarkResponse] = []
    payment_option: PaymentOption | None = None
    payment_call_remarks: str | None = None
    paying_amount: Decimal | None = None
    qr_code: str | None = None
    batch_number: str | None = None
    # The batch of the induction entry this lead came through ("Batch-29"),
    # derived from that entry's registration date. What the Foundation board
    # shows when nobody has typed a `batch_number` in yet, so a student who
    # has a batch on the Induction board doesn't read as batchless here.
    induction_batch: str | None = None
    # The batch to show: induction_batch when there is one, otherwise the
    # typed batch_number as "Batch-N". See lead_batch_label.
    batch: str | None = None
    # Which of the month's two foundation classes this lead came through - 1 for
    # the first sitting, 2 for the second. Derived from `created_at` (the day
    # the Foundation Form was filled in, which is the day of the class) rather
    # Stored and editable: see app/utils/foundation_groups.py. Not to be
    # confused with `group_assigned_at` below, which is about a WhatsApp group.
    foundation_group: int | None = None
    # Every move between groups, so the board can say a student was moved
    # rather than only where they now are.
    foundation_group_history: list[FoundationGroupMoveSchema] = Field(default_factory=list)
    group_assigned_at: datetime | None = None
    lost_reason: str | None = None
    lost_at: datetime | None = None
    payment_plan: PaymentPlanOption | None = None
    installments: list[PaymentInstallmentResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadStatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_section: dict[str, int] = {}
    # {"matched": n, "unmatched": n} over Foundation Form leads only - how many
    # came across from an induction call versus arrived cold through the form.
    by_induction_match: dict[str, int] = {}


class LeadAnalyticsItem(BaseModel):
    """One row of the Foundation board's breakdown: a course, a batch, a
    payment method or a payment remark, and what became of the leads under it.

    Carries the outcomes as well as the count for the same reason the Induction
    board's rows do - how many leads a course pulled in says nothing on its own,
    and how many of them reached Batch Confirmation and how many were lost is
    the question the board exists to answer. `collected` is the money actually
    typed against those leads, which is the Foundation board's own measure and
    has no equivalent on the Induction side.
    """

    value: str
    count: int
    # Reached Batch Confirmation - the last stage of the pipeline.
    confirmed: int
    lost: int
    collected: float
    # Only the batch dimension carries these: the month a batch is, and the
    # first of that month, which is what a chronological view sorts on. A
    # ranked breakdown has no period, so both stay None there.
    period: str | None = None
    start: date | None = None
    # The batch dimension's position on its axis (the batch number), which the
    # chronological views sort on. None for a batch that isn't a number.
    order: int | None = None


class LeadAnalyticsComparison(BaseModel):
    """The same headline figures for the period before this one, so the board
    can say whether things are moving rather than only where they stand."""

    label: str
    total: int
    confirmed: int
    lost: int


class LeadAnalyticsResponse(BaseModel):
    dimension: str
    total: int
    items: list[LeadAnalyticsItem]
    comparison: LeadAnalyticsComparison | None = None
    # The current figures the comparison is against - not always the headline
    # totals, for the same reason as on the Induction board: with no window set
    # the board totals everything, and there is no period before all time.
    current: LeadAnalyticsComparison | None = None


class LeadTimelineEntryResponse(BaseModel):
    id: uuid.UUID
    action: str
    user_name: str | None
    changes: dict | None
    created_at: datetime
