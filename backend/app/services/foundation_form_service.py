"""Business logic for the public Foundation Form (student-facing lead intake)."""
from datetime import date, timedelta

from app.exceptions.base import BadRequestError
from app.models.enums import LeadSource, PaymentTimeline
from app.models.lead import Lead
from app.repositories.lead_repository import LeadRepository
from app.schemas.foundation_form_schema import (
    FoundationFormCategory,
    FoundationFormPlanOption,
    FoundationFormPricingResponse,
    FoundationFormProgramOption,
    FoundationFormSubmit,
)
from app.services.foundation_form_pricing import CATEGORY_BY_PROGRAM, PRICING, PROGRAM_LABELS

_TIMELINE_OFFSET_DAYS = {
    PaymentTimeline.IMMEDIATE: 0,
    PaymentTimeline.TOMORROW: 1,
    PaymentTimeline.DAY_AFTER_TOMORROW: 2,
}

_TIMELINE_LABELS = {
    PaymentTimeline.IMMEDIATE: "Immediate",
    PaymentTimeline.TOMORROW: "Tomorrow",
    PaymentTimeline.DAY_AFTER_TOMORROW: "Day after tomorrow",
}


class FoundationFormService:
    def __init__(self) -> None:
        self.leads = LeadRepository()

    def get_pricing(self) -> FoundationFormPricingResponse:
        programs = [
            FoundationFormProgramOption(value=program, label=label, category=CATEGORY_BY_PROGRAM[program])
            for program, label in PROGRAM_LABELS.items()
        ]
        categories = {
            code: FoundationFormCategory(
                label=data["label"],
                training_fee=data["training_fee"],
                after_placement_fee=data["after_placement_fee"],
                plans=[
                    FoundationFormPlanOption(value=plan_value, **plan_data)
                    for plan_value, plan_data in data["plans"].items()
                ],
            )
            for code, data in PRICING.items()
        }
        return FoundationFormPricingResponse(programs=programs, categories=categories)

    def _resolve_payment_date(self, timeline: PaymentTimeline) -> date:
        return date.today() + timedelta(days=_TIMELINE_OFFSET_DAYS[timeline])

    async def submit(self, data: FoundationFormSubmit) -> Lead:
        category_code = CATEGORY_BY_PROGRAM[data.program_interest]
        category = PRICING[category_code]
        plan = category["plans"].get(data.payment_plan)
        if plan is None:
            raise BadRequestError("Selected payment plan is not valid for the chosen program.")

        payment_date = self._resolve_payment_date(data.payment_timeline)
        payment_expected = (
            f"{plan['label']} - {plan['summary']} "
            f"(After Placement: {plan['after_placement']}) | "
            f"Pays on: {_TIMELINE_LABELS[data.payment_timeline]} ({payment_date.isoformat()})"
        )

        lead = Lead(
            name=data.name,
            email=data.email,
            phone=data.mobile_number,
            source=LeadSource.FOUNDATION_FORM,
            course_interest=PROGRAM_LABELS[data.program_interest],
            payment_expected=payment_expected,
            notes=data.queries,
            reviewed=True,
            raw_form_data={
                "name": data.name,
                "mobile_number": data.mobile_number,
                "email": data.email,
                "program_interest": PROGRAM_LABELS[data.program_interest],
                "payment_plan": f"{plan['label']} - {plan['summary']}",
                "after_placement_fee": plan["after_placement"],
                "payment_timeline": _TIMELINE_LABELS[data.payment_timeline],
                "payment_date": payment_date.isoformat(),
                "queries": data.queries,
            },
        )
        await self.leads.create(lead)
        return lead
