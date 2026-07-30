"""Data access for the singleton FoundationFormConfig document.

Seeds a fresh document from the original hardcoded pricing/copy the first
time it's read, so the live form behaves identically to before this feature
existed until an admin actually edits something.
"""
from app.models.foundation_form_config import (
    FoundationFormCategory,
    FoundationFormConfig,
    FoundationFormField,
    FoundationFormPlan,
    FoundationFormProgramCfg,
)
from app.services.foundation_form_pricing import CATEGORY_BY_PROGRAM, PRICING, PROGRAM_LABELS

_SEED_OFFER_INFO = """Single Payment Offer:
Flat ₹2,500 OFF in Post Placement fee

Two-Payment Offer:
Flat ₹1,500 OFF in Post Placement fee

EMI Option (6 Weeks): (No Discounts)
Training fees can be paid in 6 weekly equal installments.
Example: If your training fee is ₹20,000, you will pay ₹3,300 per week for 6 weeks."""

_SEED_FIELDS = [
    {"key": "name", "page": 1, "type": "text", "label": "Name"},
    {"key": "mobile_number", "page": 1, "type": "tel", "label": "Mobile Number"},
    {"key": "email", "page": 1, "type": "email", "label": "Email Address"},
    {"key": "program_interest", "page": 1, "type": "text", "label": "Program you are planning to join?"},
    {"key": "payment_timeline", "page": 3, "type": "text", "label": "When will you make the payment?"},
    {"key": "queries", "page": 3, "type": "textarea", "label": "Any doubts or queries"},
]


def _seed_config() -> FoundationFormConfig:
    fields = [
        FoundationFormField(
            key=item["key"],
            page=item["page"],
            type=item["type"],
            label=item["label"],
            required=True,
            order=index,
            is_system=True,
        )
        for index, item in enumerate(_SEED_FIELDS)
    ]
    programs = [
        FoundationFormProgramCfg(value=program.value, label=label, category=CATEGORY_BY_PROGRAM[program])
        for program, label in PROGRAM_LABELS.items()
    ]
    categories = [
        FoundationFormCategory(
            code=code,
            label=data["label"],
            training_fee=data["training_fee"],
            after_placement_fee=data["after_placement_fee"],
            plans=[
                FoundationFormPlan(
                    value=plan_value.value,
                    label=plan_data["label"],
                    summary=plan_data["summary"],
                    after_placement=plan_data["after_placement"],
                    amounts=[a for a in plan_data["amounts"]],
                )
                for plan_value, plan_data in data["plans"].items()
            ],
        )
        for code, data in PRICING.items()
    ]
    return FoundationFormConfig(
        offer_info=_SEED_OFFER_INFO,
        fields=fields,
        programs=programs,
        categories=categories,
    )


class FoundationFormConfigRepository:
    async def get_or_create(self) -> FoundationFormConfig:
        config = await FoundationFormConfig.find_one({})
        if config is None:
            config = _seed_config()
            await config.insert()
        return config

    async def save(self, config: FoundationFormConfig) -> FoundationFormConfig:
        config.touch()
        await config.save()
        return config
