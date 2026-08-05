"""Request/response DTOs for the public Foundation Form and its admin config."""
import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import PaymentPlanOption, PaymentTimeline

FieldType = Literal["text", "email", "tel", "textarea"]

# chat.whatsapp.com invite codes are 20-24 url-safe chars today; the bound is
# kept loose so a future length change doesn't reject a link that works.
WHATSAPP_INVITE_PATTERN = re.compile(r"^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$")


class FoundationFormFieldConfig(BaseModel):
    """One question on page 1 or 3. Shared by the public pricing response
    (so the form can render itself) and the admin config endpoints (so the
    admin can edit it) - there's nothing sensitive in it either way."""

    key: str = Field(min_length=1, max_length=100)
    page: int = Field(ge=1, le=3)
    type: FieldType
    label: str = Field(min_length=1, max_length=200)
    required: bool = True
    order: int = 0
    is_system: bool = False


class FoundationFormProgramOption(BaseModel):
    # Open-ended Program.value rather than a closed enum - see app/models/program.py.
    value: str
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
    offer_info: str
    fields: list[FoundationFormFieldConfig]
    programs: list[FoundationFormProgramOption]
    categories: dict[str, FoundationFormCategory]


class FoundationFormSubmit(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    mobile_number: str = Field(min_length=6, max_length=20)
    email: EmailStr | None = None
    # Validated against the live programs collection in FoundationFormService.submit().
    program_interest: str | None = Field(default=None, max_length=50)
    payment_plan: PaymentPlanOption | None = None
    payment_timeline: PaymentTimeline | None = None
    queries: str | None = Field(default=None, max_length=2000)
    custom_fields: dict[str, str] = Field(default_factory=dict)
    # Which Form Collection section this came through - None for the legacy,
    # section-less public link (/foundation-form). Set by the frontend based
    # on which of the /foundation-form/{code} routes the visitor is on. Not a
    # closed enum - admins can add new sections at any time (see
    # FormCollectionSectionConfig); validated against the live config in
    # FoundationFormService.submit() instead.
    section: str | None = None


class FoundationFormSubmitResponse(BaseModel):
    message: str


# ---------- Admin config (edit fields, programs, pricing) ----------


class FoundationFormPlanConfig(BaseModel):
    value: PaymentPlanOption
    label: str = Field(min_length=1, max_length=150)
    summary: str = Field(min_length=1, max_length=255)
    after_placement: str = Field(min_length=1, max_length=100)
    amounts: list[Decimal]


class FoundationFormCategoryConfig(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=255)
    training_fee: str = Field(min_length=1, max_length=100)
    after_placement_fee: str = Field(min_length=1, max_length=100)
    plans: list[FoundationFormPlanConfig]


class FormCollectionSectionConfig(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=255)


class FoundationFormConfigResponse(BaseModel):
    offer_info: str
    fields: list[FoundationFormFieldConfig]
    categories: list[FoundationFormCategoryConfig]
    sections: list[FormCollectionSectionConfig]
    updated_at: datetime


class FoundationFormConfigUpdate(BaseModel):
    offer_info: str
    fields: list[FoundationFormFieldConfig]
    categories: list[FoundationFormCategoryConfig]
    sections: list[FormCollectionSectionConfig]


# Deliberately not part of FormCollectionSectionConfig above: the Form
# Collection editor never sends these, so folding them into that schema would
# mean every config save round-trips a link it doesn't manage.
class WhatsAppGroupLinkResponse(BaseModel):
    code: str
    label: str
    whatsapp_group_url: str | None = None


class WhatsAppGroupLinkUpdate(BaseModel):
    # Empty string clears the link; anything else must be a real WhatsApp
    # group invite, which is the only URL shape chat.whatsapp.com hands out.
    whatsapp_group_url: str = Field(default="", max_length=500)

    @field_validator("whatsapp_group_url")
    @classmethod
    def validate_invite_url(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            return ""
        if not WHATSAPP_INVITE_PATTERN.match(trimmed):
            raise ValueError(
                "Enter a WhatsApp group invite link, e.g. https://chat.whatsapp.com/AbC123..."
            )
        return trimmed
