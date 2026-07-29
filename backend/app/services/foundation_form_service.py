"""Business logic for the public Foundation Form (student-facing lead intake)."""
from datetime import date, timedelta
from decimal import Decimal

from app.exceptions.base import BadRequestError
from app.models.enums import LeadSource, PaymentPlanOption, PaymentTimeline
from app.models.lead import Lead, PaymentInstallment
from app.repositories.lead_repository import LeadRepository
from app.schemas.foundation_form_schema import (
    FoundationFormCategory,
    FoundationFormPlanOption,
    FoundationFormPricingResponse,
    FoundationFormProgramOption,
    FoundationFormSubmit,
)
from app.services.foundation_form_pricing import CATEGORY_BY_PROGRAM, PRICING, PROGRAM_LABELS

_INSTALLMENT_LABELS = {
    PaymentPlanOption.SINGLE_SHOT: ["Payment"],
    PaymentPlanOption.TWO_SHOT: ["Payment 1", "Payment 2"],
    PaymentPlanOption.EMI_6_WEEKS: [f"Week {n}" for n in range(1, 7)],
}

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
                    FoundationFormPlanOption(
                        value=plan_value,
                        label=plan_data["label"],
                        summary=plan_data["summary"],
                        after_placement=plan_data["after_placement"],
                    )
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
        installments = [
            PaymentInstallment(label=label, amount=Decimal(amount))
            for label, amount in zip(_INSTALLMENT_LABELS[data.payment_plan], plan["amounts"])
        ]

        lead = Lead(
            name=data.name,
            email=data.email,
            phone=data.mobile_number,
            source=LeadSource.FOUNDATION_FORM,
            course_interest=PROGRAM_LABELS[data.program_interest],
            payment_expected=payment_expected,
            notes=data.queries,
            reviewed=True,
            program_interest=data.program_interest,
            payment_plan=data.payment_plan,
            installments=installments,
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
