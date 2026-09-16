"""What a set of Foundation Form answers implies about a lead.

Two places collect those answers: the public form a candidate fills in
themselves (FoundationFormService.submit) and the staff Create Lead modal a
staffer fills in during a call (LeadService.create). They ask the same
questions, so they have to reach the same conclusions from them - the course
name behind the chosen program, the installment schedule its plan generates,
the payment-expected summary the board reads, and the answer snapshot Form
Check shows.

Deriving that twice is precisely how the two paths drift apart, so it is
derived here once and called from both. This module deliberately knows nothing
about *which* answers are mandatory: that differs between a stranger filling in
a form and a staffer transcribing what somebody just said on the phone, and it
belongs to each caller.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.exceptions.base import BadRequestError
from app.models.enums import PaymentPlanOption, PaymentTimeline
from app.models.foundation_form_config import FoundationFormConfig
from app.models.lead import PaymentInstallment
from app.repositories.program_repository import ProgramRepository
from app.services.foundation_form_pricing import (
    build_installments,
    build_payment_expected_summary,
    get_plan_details,
)

_TIMELINE_OFFSET_DAYS = {
    PaymentTimeline.IMMEDIATE: 0,
    PaymentTimeline.TOMORROW: 1,
    PaymentTimeline.DAY_AFTER_TOMORROW: 2,
}


@dataclass
class DerivedAnswers:
    """Everything the answers imply, worked out before we know whether they
    will become a new lead, update an existing one, or be hand-keyed by
    staff - the derivation is the same either way, only the write differs."""

    course_interest: str | None = None
    payment_expected: str | None = None
    installments: list[PaymentInstallment] = field(default_factory=list)
    raw_form_data: dict[str, str] = field(default_factory=dict)


def resolve_payment_date(timeline: PaymentTimeline) -> date:
    return date.today() + timedelta(days=_TIMELINE_OFFSET_DAYS[timeline])


async def derive_answers(
    *,
    config: FoundationFormConfig,
    programs: ProgramRepository,
    name: str,
    mobile_number: str,
    email: str | None = None,
    program_interest: str | None = None,
    payment_plan: PaymentPlanOption | None = None,
    payment_timeline: PaymentTimeline | None = None,
    queries: str | None = None,
    custom_fields: dict[str, str] | None = None,
) -> DerivedAnswers:
    derived = DerivedAnswers(raw_form_data={"name": name, "mobile_number": mobile_number})

    if program_interest is not None:
        program = await programs.get_by_value(program_interest)
        if program is None or not program.is_active:
            raise BadRequestError("Selected program is not valid.")
        derived.course_interest = program.name
        derived.raw_form_data["program_interest"] = program.name

        if payment_plan is not None:
            plan = get_plan_details(config, program.category, payment_plan)
            derived.installments = build_installments(config, program.category, payment_plan)
            derived.payment_expected = build_payment_expected_summary(config, program.category, payment_plan)
            derived.raw_form_data["payment_plan"] = f"{plan.label} - {plan.summary}"
            derived.raw_form_data["after_placement_fee"] = plan.after_placement

    if payment_timeline is not None:
        payment_date = resolve_payment_date(payment_timeline)
        weekday_name = payment_date.strftime("%A")
        derived.raw_form_data["payment_timeline"] = weekday_name
        derived.raw_form_data["payment_date"] = payment_date.isoformat()
        timeline_suffix = f"Pays on: {weekday_name} ({payment_date.isoformat()})"
        derived.payment_expected = (
            f"{derived.payment_expected} | {timeline_suffix}" if derived.payment_expected else timeline_suffix
        )

    if email is not None:
        derived.raw_form_data["email"] = email
    if queries is not None:
        derived.raw_form_data["queries"] = queries
    derived.raw_form_data.update(custom_fields or {})
    return derived
