"""Business logic for the public Foundation Form (student-facing lead intake).

The Foundation Form is the second half of a two-step intake. Someone is first
keyed into the Induction Call Form by staff, goes through the induction call,
and is only then sent this form's link. So a submission is usually not a new
person at all - it's the same person arriving through a second door, and the
mobile number is what identifies them across the two.

`submit` therefore resolves one of three outcomes before it writes anything:

    an existing lead has this number   -> update it, never create a second
    an induction entry has this number -> create the lead linked to it
    neither                            -> create an unmatched lead

See app/utils/phone.py for why the number is normalized before any of that.
"""
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.database.base import utcnow
from app.exceptions.base import BadRequestError
from app.models.enums import LeadSource, PaymentTimeline
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead, PaymentInstallment
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.induction_entry_repository import InductionEntryRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.program_repository import ProgramRepository
from app.schemas.foundation_form_schema import (
    FoundationFormCategory,
    FoundationFormFieldConfig,
    FoundationFormPlanOption,
    FoundationFormPricingResponse,
    FoundationFormProgramOption,
    FoundationFormSubmit,
)
from app.services.foundation_form_pricing import build_installments, build_payment_expected_summary, get_plan_details
from app.utils.phone import normalize_phone

_TIMELINE_OFFSET_DAYS = {
    PaymentTimeline.IMMEDIATE: 0,
    PaymentTimeline.TOMORROW: 1,
    PaymentTimeline.DAY_AFTER_TOMORROW: 2,
}


@dataclass
class _Derived:
    """Everything the submission implies, worked out before we know whether it
    will become a new lead or update an existing one - the derivation is the
    same either way, only the write differs."""

    course_interest: str | None = None
    payment_expected: str | None = None
    installments: list[PaymentInstallment] = field(default_factory=list)
    raw_form_data: dict[str, str] = field(default_factory=dict)


class FoundationFormService:
    def __init__(self) -> None:
        self.leads = LeadRepository()
        self.entries = InductionEntryRepository()
        self.config_repo = FoundationFormConfigRepository()
        self.programs = ProgramRepository()

    async def get_pricing(self) -> FoundationFormPricingResponse:
        config = await self.config_repo.get_or_create()
        # The dropdown's options, straight from the programs collection - this
        # is what makes an Add/Edit/Delete in Admin > Programs show up in the
        # public form on the next load, with no code change.
        programs = [
            FoundationFormProgramOption(value=p.value, label=p.name, category=p.category)
            for p in await self.programs.list_active()
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

    def _validate(self, data: FoundationFormSubmit, config) -> None:
        field_by_key = {f.key: f for f in config.fields}

        if data.section is not None and not any(s.code == data.section for s in config.sections):
            raise BadRequestError("Selected Form Collection section is not valid.")

        def _require(key: str, value) -> None:
            field_cfg = field_by_key.get(key)
            if field_cfg is not None and field_cfg.required and not value:
                raise BadRequestError(f"{field_cfg.label} is required.")

        _require("email", data.email)
        _require("program_interest", data.program_interest)
        _require("payment_timeline", data.payment_timeline)
        _require("queries", data.queries)
        for key, field_cfg in field_by_key.items():
            if not field_cfg.is_system and field_cfg.required and not data.custom_fields.get(key):
                raise BadRequestError(f"{field_cfg.label} is required.")

    async def _derive(self, data: FoundationFormSubmit, config) -> _Derived:
        derived = _Derived(raw_form_data={"name": data.name, "mobile_number": data.mobile_number})

        if data.program_interest is not None:
            program = await self.programs.get_by_value(data.program_interest)
            if program is None or not program.is_active:
                raise BadRequestError("Selected program is not valid.")
            derived.course_interest = program.name
            derived.raw_form_data["program_interest"] = program.name

            if data.payment_plan is not None:
                plan = get_plan_details(config, program.category, data.payment_plan)
                derived.installments = build_installments(config, program.category, data.payment_plan)
                derived.payment_expected = build_payment_expected_summary(
                    config, program.category, data.payment_plan
                )
                derived.raw_form_data["payment_plan"] = f"{plan.label} - {plan.summary}"
                derived.raw_form_data["after_placement_fee"] = plan.after_placement

        if data.payment_timeline is not None:
            payment_date = self._resolve_payment_date(data.payment_timeline)
            weekday_name = payment_date.strftime("%A")
            derived.raw_form_data["payment_timeline"] = weekday_name
            derived.raw_form_data["payment_date"] = payment_date.isoformat()
            timeline_suffix = f"Pays on: {weekday_name} ({payment_date.isoformat()})"
            derived.payment_expected = (
                f"{derived.payment_expected} | {timeline_suffix}" if derived.payment_expected else timeline_suffix
            )

        if data.email is not None:
            derived.raw_form_data["email"] = data.email
        if data.queries is not None:
            derived.raw_form_data["queries"] = data.queries
        derived.raw_form_data.update(data.custom_fields)
        return derived

    @staticmethod
    def _ownership(entry: InductionEntry, form_section: str | None) -> tuple[str | None, uuid.UUID | None]:
        """Who owns the lead once it moves across from Induction.

        The induction entry was round-robined to a Section Admin, and that
        person has already spoken to this student - handing the Foundation lead
        to someone else would throw away the relationship.

        An explicit section on the form still wins, because it means the
        student was sent that section's link on purpose. The assignee is only
        inherited when the section it belongs to survives that: a Section A
        admin owning a Section B lead would sit outside their own scope and
        promptly vanish from their board.
        """
        section = form_section or entry.section
        assigned_to = entry.assigned_to if section == entry.section else None
        return section, assigned_to

    async def _link(self, entry: InductionEntry, lead: Lead) -> None:
        """Records the move in both directions.

        The back-reference on the entry is what takes it off the active
        Induction board, and it's stored rather than derived from a lookup so
        that board's list, stats and filter options stay single indexed
        queries. Both writes happen here so the two can't disagree.

        Called after the lead is inserted, never before. There's no transaction
        spanning the two collections, so one of them has to be written first,
        and this order fails safe: a crash in between leaves the entry sitting
        on the Induction board next to a lead that already exists, which is
        visible and fixable. The other order would take the entry off the board
        while pointing it at a lead that was never created.
        """
        entry.foundation_lead_id = lead.id
        entry.converted_at = utcnow()
        entry.touch()
        await entry.save()

    @staticmethod
    def _has_recorded_payment(lead: Lead) -> bool:
        """Whether anything has been entered against this lead's payment plan.

        Deliberately wider than `installment.paid`: that flag only flips once a
        proof file has been uploaded, so an installment carrying a mode and a
        transaction id but no proof yet still reads as unpaid. It's someone's
        half-finished work all the same, and rebuilding the plan around it
        would throw the entered details away.
        """
        return any(
            installment.paid
            or installment.paid_at
            or installment.mode
            or installment.transaction_id
            or installment.upi_id
            or installment.proof_url
            for installment in lead.installments
        )

    async def _merge_resubmission(
        self, lead: Lead, data: FoundationFormSubmit, derived: _Derived, phone_normalized: str | None
    ) -> Lead:
        """Folds a repeat submission into the lead that already exists for this
        number, instead of creating a second one.

        What the student just told us wins for the answers they gave. What the
        office has since done to the lead - its stage, its owner, staff remarks,
        any payment actually collected - is left alone: this is a form being
        filled in again, not a reason to reopen a lead that has moved on.
        """
        lead.name = data.name
        if data.email is not None:
            lead.email = data.email
        if data.queries is not None:
            lead.notes = data.queries
        if derived.course_interest is not None:
            lead.course_interest = derived.course_interest
        if data.program_interest is not None:
            lead.program_interest = data.program_interest
        # Merged, not replaced: a second submission that skipped an optional
        # question shouldn't erase the answer given the first time.
        lead.raw_form_data = {**(lead.raw_form_data or {}), **derived.raw_form_data}

        # Rebuilding the plan would wipe transaction ids, proofs and paid flags
        # off money that has already been collected. Once anything has been
        # recorded against it the plan is a financial record, not a form
        # answer, so the resubmission doesn't get to touch it.
        if derived.installments and not self._has_recorded_payment(lead):
            lead.payment_plan = data.payment_plan
            lead.installments = derived.installments
        if derived.payment_expected is not None:
            lead.payment_expected = derived.payment_expected

        # Only ever fills a gap. A lead already routed to a section stays there.
        if lead.section is None and data.section is not None:
            lead.section = data.section
        if phone_normalized is not None:
            lead.phone_normalized = phone_normalized

        # A late match: the induction entry may have been keyed in after this
        # lead was first created, in which case the link is only possible now.
        if lead.induction_entry_id is None and phone_normalized is not None:
            entry = await self.entries.find_unconverted_by_phone(phone_normalized)
            if entry is not None:
                inherited_section, inherited_assignee = self._ownership(entry, lead.section)
                lead.induction_entry_id = entry.id
                lead.section = inherited_section
                if lead.assigned_to is None:
                    lead.assigned_to = inherited_assignee
                await self._link(entry, lead)

        lead.touch()
        await lead.save()
        return lead

    async def submit(self, data: FoundationFormSubmit) -> Lead:
        config = await self.config_repo.get_or_create()
        self._validate(data, config)
        derived = await self._derive(data, config)

        phone_normalized = normalize_phone(data.mobile_number)

        # Duplicate prevention runs before matching, and deliberately so: on a
        # resubmit both an existing lead and (once linked) no induction entry
        # would be found, and checking in the other order would create a second
        # lead for someone we already have.
        existing = await self.leads.find_by_phone_normalized(phone_normalized) if phone_normalized else None
        if existing is not None:
            return await self._merge_resubmission(existing, data, derived, phone_normalized)

        entry = await self.entries.find_unconverted_by_phone(phone_normalized) if phone_normalized else None
        section, assigned_to = self._ownership(entry, data.section) if entry else (data.section, None)

        lead = Lead(
            name=data.name,
            email=data.email,
            phone=data.mobile_number,
            phone_normalized=phone_normalized,
            # None when nobody with this number came through Induction. That's
            # an unmatched Foundation lead - a normal outcome, not a failure.
            induction_entry_id=entry.id if entry else None,
            source=LeadSource.FOUNDATION_FORM,
            course_interest=derived.course_interest,
            payment_expected=derived.payment_expected,
            notes=data.queries,
            reviewed=True,
            program_interest=data.program_interest,
            payment_plan=data.payment_plan,
            installments=derived.installments,
            raw_form_data=derived.raw_form_data,
            section=section,
            assigned_to=assigned_to,
        )
        await self.leads.create(lead)
        if entry is not None:
            await self._link(entry, lead)
        return lead
