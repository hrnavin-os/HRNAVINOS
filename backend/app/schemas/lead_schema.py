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
    ProgramInterest,
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


class LeadAssign(BaseModel):
    assigned_to: uuid.UUID


class LeadPlanAssign(BaseModel):
    program_interest: ProgramInterest
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
    program_interest: ProgramInterest | None = None
    section: str | None = None
    remarks: str | None = None
    payment_option: PaymentOption | None = None
    payment_call_remarks: PaymentCallRemark | None = None
    payment_plan: PaymentPlanOption | None = None
    installments: list[PaymentInstallmentResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadStatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_section: dict[str, int] = {}


class LeadTimelineEntryResponse(BaseModel):
    id: uuid.UUID
    action: str
    user_name: str | None
    changes: dict | None
    created_at: datetime
