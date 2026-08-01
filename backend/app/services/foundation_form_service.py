"""Business logic for the public Foundation Form (student-facing lead intake)."""
from datetime import date, timedelta

from app.exceptions.base import BadRequestError
from app.models.enums import LeadSource, PaymentTimeline
from app.models.lead import Lead
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.lead_repository import LeadRepository
from app.schemas.foundation_form_schema import (
    FoundationFormCategory,
    FoundationFormFieldConfig,
    FoundationFormPlanOption,
    FoundationFormPricingResponse,
    FoundationFormProgramOption,
    FoundationFormSubmit,
)
from app.services.foundation_form_pricing import build_installments, build_payment_expected_summary, get_plan_details

_TIMELINE_OFFSET_DAYS = {
    PaymentTimeline.IMMEDIATE: 0,
    PaymentTimeline.TOMORROW: 1,
    PaymentTimeline.DAY_AFTER_TOMORROW: 2,
}


class FoundationFormService:
    def __init__(self) -> None:
        self.leads = LeadRepository()
        self.config_repo = FoundationFormConfigRepository()

    async def get_pricing(self) -> FoundationFormPricingResponse:
        config = await self.config_repo.get_or_create()
        programs = [
            FoundationFormProgramOption(value=p.value, label=p.label, category=p.category) for p in config.programs
        ]
        categories = {
            c.code: FoundationFormCategory(
                label=c.label,
                training_fee=c.training_fee,
                after_placement_fee=c.after_placement_fee,
                plans=[
                    FoundationFormPlanOption(
                        value=p.value, label=p.label, summary=p.summary, after_placement=p.after_placement
                    )
                    for p in c.plans
                ],
            )
            for c in config.categories
        }
        fields = [
            FoundationFormFieldConfig(
                key=f.key, page=f.page, type=f.type, label=f.label, required=f.required, order=f.order,
                is_system=f.is_system,
            )
            for f in sorted(config.fields, key=lambda field: (field.page, field.order))
        ]
        return FoundationFormPricingResponse(
            offer_info=config.offer_info, fields=fields, programs=programs, categories=categories
        )

    def _resolve_payment_date(self, timeline: PaymentTimeline) -> date:
        return date.today() + timedelta(days=_TIMELINE_OFFSET_DAYS[timeline])

    async def submit(self, data: FoundationFormSubmit) -> Lead:
        config = await self.config_repo.get_or_create()
        field_by_key = {f.key: f for f in config.fields}

        if data.section is not None and not any(s.code == data.section for s in config.sections):
            raise BadRequestError("Selected Form Collection section is not valid.")

        def _require(key: str, value) -> None:
            field = field_by_key.get(key)
            if field is not None and field.required and not value:
                raise BadRequestError(f"{field.label} is required.")

        _require("email", data.email)
        _require("program_interest", data.program_interest)
        _require("payment_timeline", data.payment_timeline)
        _require("queries", data.queries)
        for key, field in field_by_key.items():
            if not field.is_system and field.required and not data.custom_fields.get(key):
                raise BadRequestError(f"{field.label} is required.")

        raw_form_data: dict[str, str] = {"name": data.name, "mobile_number": data.mobile_number}
        course_interest: str | None = None
        payment_expected: str | None = None
        installments = []

        if data.program_interest is not None:
            program_cfg = next((p for p in config.programs if p.value == data.program_interest), None)
            if program_cfg is None:
                raise BadRequestError("Selected program is not valid.")
            course_interest = program_cfg.label
            raw_form_data["program_interest"] = program_cfg.label

            if data.payment_plan is not None:
                plan = get_plan_details(config, data.program_interest, data.payment_plan)
                installments = build_installments(config, data.program_interest, data.payment_plan)
                payment_expected = build_payment_expected_summary(config, data.program_interest, data.payment_plan)
                raw_form_data["payment_plan"] = f"{plan.label} - {plan.summary}"
                raw_form_data["after_placement_fee"] = plan.after_placement

        if data.payment_timeline is not None:
            payment_date = self._resolve_payment_date(data.payment_timeline)
            weekday_name = payment_date.strftime("%A")
            raw_form_data["payment_timeline"] = weekday_name
            raw_form_data["payment_date"] = payment_date.isoformat()
            timeline_suffix = f"Pays on: {weekday_name} ({payment_date.isoformat()})"
            payment_expected = f"{payment_expected} | {timeline_suffix}" if payment_expected else timeline_suffix

        if data.email is not None:
            raw_form_data["email"] = data.email
        if data.queries is not None:
            raw_form_data["queries"] = data.queries
        raw_form_data.update(data.custom_fields)

        lead = Lead(
            name=data.name,
            email=data.email,
            phone=data.mobile_number,
            source=LeadSource.FOUNDATION_FORM,
            course_interest=course_interest,
            payment_expected=payment_expected,
            notes=data.queries,
            reviewed=True,
            program_interest=data.program_interest,
            payment_plan=data.payment_plan,
            installments=installments,
            raw_form_data=raw_form_data,
            section=data.section,
        )
        await self.leads.create(lead)
        return lead
