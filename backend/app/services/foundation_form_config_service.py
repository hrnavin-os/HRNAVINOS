"""Business logic for the admin-editable Foundation Form config singleton."""
import uuid

from app.exceptions.base import BadRequestError, NotFoundError
from app.models.enums import PaymentPlanOption, ProgramInterest
from app.models.foundation_form_config import (
    FormCollectionSectionCfg,
    FoundationFormCategory,
    FoundationFormConfig,
    FoundationFormField,
    FoundationFormPlan,
    FoundationFormProgramCfg,
)
from app.permissions.permission_codes import Permissions
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.permission_repository import PermissionRepository
from app.repositories.role_repository import RoleRepository
from app.schemas.foundation_form_schema import FoundationFormConfigUpdate
from app.schemas.role_schema import RoleCreate
from app.services.audit_service import AuditService
from app.services.foundation_form_pricing import INSTALLMENT_LABELS
from app.services.role_service import RoleService

_SECTION_ROLE_PERMISSIONS = [Permissions.LEADS_VIEW, Permissions.LEADS_UPDATE]

_REQUIRED_CATEGORY_CODES = {"only_recruitment", "internship_or_generalist", "generalist_internship"}
_REQUIRED_PLAN_VALUES = set(PaymentPlanOption)
_REQUIRED_PROGRAM_VALUES = set(ProgramInterest)
_UNDELETABLE_FIELD_KEYS = {"name", "mobile_number"}
_STRUCTURAL_FIELD_KEYS = {"program_interest", "payment_timeline"}


class FoundationFormConfigService:
    def __init__(self) -> None:
        self.repo = FoundationFormConfigRepository()
        self.leads = LeadRepository()
        self.roles = RoleRepository()
        self.permissions = PermissionRepository()
        self.role_service = RoleService()
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

    def _next_section_code(self, existing_codes: set[str]) -> str:
        for offset in range(26):
            code = chr(ord("a") + offset)
            if code not in existing_codes:
                return code
        return f"section-{len(existing_codes) + 1}"

    def _role_name_for_section(self, code: str) -> str:
        return f"Admin {code.upper()}-Section"

    async def _ensure_section_role(self, code: str, *, actor_id: uuid.UUID | None) -> None:
        """Every Form Collection section gets its own scoped admin role,
        auto-created the moment the section exists - matches this session's
        naming convention (e.g. "Admin D-Section") and grants exactly the
        lead-management rights (not FORM_COLLECTION_CONFIGURE) a Section
        Admin needs. Idempotent: a no-op if the role already exists, so this
        is also safe to call for sections that predate this feature."""
        role_name = self._role_name_for_section(code)
        if await self.roles.get_by_name(role_name):
            return
        permissions = await self.permissions.get_by_codes([p.value for p in _SECTION_ROLE_PERMISSIONS])
        await self.role_service.create(
            RoleCreate(
                name=role_name,
                description=f"Manages leads filed under Form Collection's {code.upper()} section.",
                permission_ids=[p.id for p in permissions],
                scoped_section=code,
            ),
            actor_id=actor_id,
        )

    async def add_section(self, *, actor_id: uuid.UUID | None) -> FoundationFormConfig:
        config = await self.repo.get_or_create()
        code = self._next_section_code({s.code for s in config.sections})
        config.sections.append(FormCollectionSectionCfg(code=code, label=f"{code.upper()} Section"))
        await self.repo.save(config)
        await self._ensure_section_role(code, actor_id=actor_id)
        await self.audit.record(
            user_id=actor_id,
            action="CREATE",
            entity_type="FoundationFormConfig",
            entity_id=str(config.id),
            changes={"added_section": code},
        )
        return config

    async def delete_section(self, code: str, *, actor_id: uuid.UUID | None) -> FoundationFormConfig:
        config = await self.repo.get_or_create()
        if not any(s.code == code for s in config.sections):
            raise NotFoundError(f"Section '{code}' does not exist.")

        lead_count = await self.leads.count_by_section(code)
        if lead_count > 0:
            raise BadRequestError(
                f"Can't delete this section - {lead_count} lead(s) are still filed under it."
            )

        config.sections = [s for s in config.sections if s.code != code]
        await self.repo.save(config)
        await self.audit.record(
            user_id=actor_id,
            action="DELETE",
            entity_type="FoundationFormConfig",
            entity_id=str(config.id),
            changes={"deleted_section": code},
        )
        return config
