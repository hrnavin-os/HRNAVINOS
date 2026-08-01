"""Business logic for the admin-editable Foundation Form config singleton."""
import uuid

from app.exceptions.base import BadRequestError
from app.models.enums import PaymentPlanOption, ProgramInterest
from app.models.foundation_form_config import (
    FormCollectionSectionCfg,
    FoundationFormCategory,
    FoundationFormConfig,
    FoundationFormField,
    FoundationFormPlan,
    FoundationFormProgramCfg,
)
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.schemas.foundation_form_schema import FoundationFormConfigUpdate
from app.services.audit_service import AuditService
from app.services.foundation_form_pricing import INSTALLMENT_LABELS

_REQUIRED_CATEGORY_CODES = {"only_recruitment", "internship_or_generalist", "generalist_internship"}
_REQUIRED_PLAN_VALUES = set(PaymentPlanOption)
_REQUIRED_PROGRAM_VALUES = set(ProgramInterest)
_UNDELETABLE_FIELD_KEYS = {"name", "mobile_number"}
_STRUCTURAL_FIELD_KEYS = {"program_interest", "payment_timeline"}


class FoundationFormConfigService:
    def __init__(self) -> None:
        self.repo = FoundationFormConfigRepository()
        self.audit = AuditService()

    async def get_config(self) -> FoundationFormConfig:
        return await self.repo.get_or_create()

    def _validate(self, data: FoundationFormConfigUpdate) -> None:
        field_keys = [f.key for f in data.fields]
        if len(field_keys) != len(set(field_keys)):
            raise BadRequestError("Form fields must have unique keys.")
        for required_key in _UNDELETABLE_FIELD_KEYS:
            match = next((f for f in data.fields if f.key == required_key), None)
            if match is None or not match.is_system:
                raise BadRequestError(f"The '{required_key}' field is required and cannot be removed.")
        for structural_key in _STRUCTURAL_FIELD_KEYS:
            match = next((f for f in data.fields if f.key == structural_key), None)
            if match is not None and not match.is_system:
                raise BadRequestError(f"'{structural_key}' is a reserved field key.")

        program_values = {p.value for p in data.programs}
        if program_values != _REQUIRED_PROGRAM_VALUES:
            raise BadRequestError("All 4 programs must be present - programs can't be added or removed.")

        category_codes = {c.code for c in data.categories}
        if category_codes != _REQUIRED_CATEGORY_CODES:
            raise BadRequestError("All 3 pricing categories must be present - categories can't be added or removed.")

        valid_program_categories = {c.code for c in data.categories}
        for program in data.programs:
            if program.category not in valid_program_categories:
                raise BadRequestError(f"Program '{program.value}' references an unknown category.")

        for category in data.categories:
            plan_values = {p.value for p in category.plans}
            if plan_values != _REQUIRED_PLAN_VALUES:
                raise BadRequestError(
                    f"Category '{category.code}' must have exactly single_shot/two_shot/emi_6_weeks plans."
                )
            for plan in category.plans:
                expected_length = len(INSTALLMENT_LABELS[plan.value])
                if len(plan.amounts) != expected_length:
                    raise BadRequestError(
                        f"'{plan.value}' plan in '{category.code}' needs exactly {expected_length} amount(s)."
                    )

        section_codes = [s.code for s in data.sections]
        if len(section_codes) != len(set(section_codes)):
            raise BadRequestError("Form Collection sections must have unique codes.")

    def _validate_sections_not_removed(
        self, existing: FoundationFormConfig, data: FoundationFormConfigUpdate
    ) -> None:
        # Unlike programs/categories, sections are open-ended (admins add new
        # ones over time) - but an existing code can't be dropped or renamed
        # to a different code, since leads already reference it by code.
        existing_codes = {s.code for s in existing.sections}
        new_codes = {s.code for s in data.sections}
        missing = existing_codes - new_codes
        if missing:
            raise BadRequestError(f"Existing section(s) can't be removed: {', '.join(sorted(missing))}.")

    async def update_config(self, data: FoundationFormConfigUpdate, *, actor_id: uuid.UUID | None) -> FoundationFormConfig:
        self._validate(data)
        config = await self.repo.get_or_create()
        self._validate_sections_not_removed(config, data)

        config.offer_info = data.offer_info
        config.fields = [
            FoundationFormField(
                key=f.key, page=f.page, type=f.type, label=f.label, required=f.required, order=f.order,
                is_system=f.is_system,
            )
            for f in data.fields
        ]
        config.programs = [
            FoundationFormProgramCfg(value=p.value, label=p.label, category=p.category) for p in data.programs
        ]
        config.categories = [
            FoundationFormCategory(
                code=c.code,
                label=c.label,
                training_fee=c.training_fee,
                after_placement_fee=c.after_placement_fee,
                plans=[
                    FoundationFormPlan(
                        value=p.value, label=p.label, summary=p.summary, after_placement=p.after_placement,
                        amounts=p.amounts,
                    )
                    for p in c.plans
                ],
            )
            for c in data.categories
        ]
        config.sections = [FormCollectionSectionCfg(code=s.code, label=s.label) for s in data.sections]

        await self.repo.save(config)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="FoundationFormConfig", entity_id=str(config.id)
        )
        return config
