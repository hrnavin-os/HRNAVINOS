"""Request/response DTOs for the public Foundation Form."""
from pydantic import BaseModel, EmailStr, Field

from app.models.enums import PaymentPlanOption, PaymentTimeline, ProgramInterest


class FoundationFormProgramOption(BaseModel):
    value: ProgramInterest
    label: str
    category: str


class FoundationFormPlanOption(BaseModel):
    value: PaymentPlanOption
    label: str
    summary: str
    after_placement: str


class FoundationFormCategory(BaseModel):
    label: str
    training_fee: str
    after_placement_fee: str
    plans: list[FoundationFormPlanOption]


class FoundationFormPricingResponse(BaseModel):
    programs: list[FoundationFormProgramOption]
    categories: dict[str, FoundationFormCategory]


class FoundationFormSubmit(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    mobile_number: str = Field(min_length=6, max_length=20)
    email: EmailStr
    program_interest: ProgramInterest
    payment_plan: PaymentPlanOption
    payment_timeline: PaymentTimeline
    queries: str = Field(min_length=1, max_length=2000)


class FoundationFormSubmitResponse(BaseModel):
    message: str
