"""FoundationFormConfig document - a singleton holding everything about the
public Foundation Form an admin can edit at runtime: the offer-info text, the
form's fields/questions, and the program/category/payment-plan pricing.

Mirrors the AppSettings singleton pattern (app/models/settings.py) - fetched
via find_one({}) with no filter, so there is exactly one document.
"""
from pydantic import BaseModel, Field

from app.database.base import BaseDocument
from app.database.types import MongoDecimal


class FoundationFormField(BaseModel):
    """One question on page 1 or page 3. `program_interest` and
    `payment_timeline` are special system fields whose presence turns on the
    corresponding built-in UI (program/plan step, computed-date radios) -
    every other field (system or custom) is a plain text/email/tel/textarea
    input. `name`/`mobile_number` are the only fields that can never be
    deleted, since Lead.name/Lead.phone are non-nullable everywhere in the
    CRM - that's enforced in FoundationFormConfigService, not here."""

    key: str = Field(max_length=100)
    page: int = Field(ge=1, le=3)
    type: str = Field(max_length=20)  # "text" | "email" | "tel" | "textarea"
    label: str = Field(max_length=200)
    required: bool = True
    order: int = 0
    is_system: bool = False


class FoundationFormPlan(BaseModel):
    value: str = Field(max_length=50)  # PaymentPlanOption value
    label: str = Field(max_length=150)
    summary: str = Field(max_length=255)
    after_placement: str = Field(max_length=100)
    amounts: list[MongoDecimal] = Field(default_factory=list)


class FoundationFormCategory(BaseModel):
    code: str = Field(max_length=50)
    label: str = Field(max_length=255)
    training_fee: str = Field(max_length=100)
    after_placement_fee: str = Field(max_length=100)
    plans: list[FoundationFormPlan] = Field(default_factory=list)


class FoundationFormProgramCfg(BaseModel):
    value: str = Field(max_length=50)  # ProgramInterest value
    label: str = Field(max_length=255)
    category: str = Field(max_length=50)


class FormCollectionSectionCfg(BaseModel):
    """One Form Collection section (A/B/C/...). Unlike programs/categories,
    this list is open-ended - admins can add new sections at any time from
    the Form Collection landing page. `code` is the stable identifier stored
    on Lead.section and Role.scoped_section; once created it's never reused
    for a different section, and existing codes can't be removed via the
    config update (see FoundationFormConfigService._validate)."""

    code: str = Field(max_length=50)
    label: str = Field(max_length=255)


class FoundationFormConfig(BaseDocument):
    offer_info: str = ""
    fields: list[FoundationFormField] = Field(default_factory=list)
    programs: list[FoundationFormProgramCfg] = Field(default_factory=list)
    categories: list[FoundationFormCategory] = Field(default_factory=list)
    sections: list[FormCollectionSectionCfg] = Field(default_factory=list)

    class Settings:
        name = "foundation_form_config"

    def __repr__(self) -> str:
        return f"<FoundationFormConfig fields={len(self.fields)}>"
