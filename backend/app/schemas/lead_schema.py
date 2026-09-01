"""Request/response DTOs for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import (
    InstallmentPaymentMode,
    LeadSource,
    LeadStatus,
    PaymentCallRemark,
    PaymentMethod,
    PaymentOption,
    PaymentPlanOption,
)


class LeadCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str = Field(min_length=6, max_length=20)
    source: LeadSource = LeadSource.OTHER
    course_interest: str = Field(min_length=1, max_length=150)
    batch_preference: str | None = Field(default=None, max_length=150)
    payment_expected: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None
    section: str | None = None
    remarks: str | None = Field(default=None, max_length=2000)


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
    payment_call_remarks: PaymentCallRemark | None = None
    paying_amount: Decimal | None = Field(default=None, ge=0)
    qr_code: str | None = Field(default=None, max_length=100)
    batch_number: str | None = Field(default=None, max_length=50)
    # Required by LeadService.update whenever status moves to Lost.
    lost_reason: str | None = Field(default=None, max_length=500)


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
    mode: InstallmentPaymentMode | None
    transaction_id: str | None
    upi_id: str | None
    proof_url: str | None
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
    payment_call_remarks: PaymentCallRemark | None = None
    paying_amount: Decimal | None = None
    qr_code: str | None = None
    batch_number: str | None = None
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


class LeadTimelineEntryResponse(BaseModel):
    id: uuid.UUID
    action: str
    user_name: str | None
    changes: dict | None
    created_at: datetime
