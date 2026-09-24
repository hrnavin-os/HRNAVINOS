"""Business logic for the admin-editable Induction Call Form config."""
import uuid

from app.exceptions.base import BadRequestError
from app.models.induction_form_config import InductionFormConfig, InductionFormField
from app.repositories.induction_form_config_repository import InductionFormConfigRepository
from app.schemas.induction_form_config_schema import InductionFormConfigUpdate
from app.services.audit_service import AuditService
from app.utils.foundation_groups import parse_foundation_group

# The submit endpoint parses exactly these keys, so the set can't change from
# the editor - an unknown key would render a field whose answer is silently
# dropped, and a missing one would remove a question the API still needs.
_ALLOWED_KEYS = {
    "name", "email", "phone", "registration_date", "paid_date",
    "sales_person", "lead_source", "payment_mode", "category", "section", "group", "batch",
}

# Non-nullable on InductionEntry, so the form can't stop asking for them.
_ALWAYS_REQUIRED = {"name", "phone", "registration_date"}


class InductionFormConfigService:
    def __init__(self) -> None:
        self.repo = InductionFormConfigRepository()
        self.audit = AuditService()

    async def get_config(self) -> InductionFormConfig:
        return await self.repo.get_or_create()

    def _validate(self, data: InductionFormConfigUpdate) -> None:
        keys = [field.key for field in data.fields]
        if len(keys) != len(set(keys)):
            raise BadRequestError("Each field can only appear once.")
        if set(keys) != _ALLOWED_KEYS:
            missing = _ALLOWED_KEYS - set(keys)
            unknown = set(keys) - _ALLOWED_KEYS
            if missing:
                raise BadRequestError(f"These fields can't be removed: {', '.join(sorted(missing))}.")
            raise BadRequestError(f"Unknown field(s): {', '.join(sorted(unknown))}.")

        for field in data.fields:
            if field.key in _ALWAYS_REQUIRED and not field.required:
                raise BadRequestError(f"'{field.label}' is stored on every entry and has to stay required.")
            if not field.label.strip():
                raise BadRequestError("Every field needs a label.")
            # The group field's options are read as numbers on submit, not kept
            # as the text they were picked from, so an option that names no
            # group would offer the student a choice the API then refuses.
            # Caught here, where whoever typed it is looking, rather than on
            # somebody's submission days later.
            # A number field: a dropdown of suggestions would render it as a
            # free-text combobox and move it to the second page.
            if field.key == "batch" and any(option.strip() for option in field.options):
                raise BadRequestError("Batch Number is typed as a number and can't have dropdown options.")
            if field.key == "group":
                for option in field.options:
                    if option.strip():
                        parse_foundation_group(option)

    async def update_config(
        self, data: InductionFormConfigUpdate, *, actor_id: uuid.UUID | None
    ) -> InductionFormConfig:
        self._validate(data)
        config = await self.repo.get_or_create()
        config.fields = [
            InductionFormField(
                key=field.key,
                label=field.label.strip(),
                required=field.required,
                order=index,
                # Blank lines are dropped and duplicates collapsed, so a list
                # edited in a textarea doesn't grow stray empty options.
                options=list(dict.fromkeys(o.strip() for o in field.options if o.strip())),
            )
            for index, field in enumerate(data.fields)
        ]
        config.updated_by = actor_id
        await self.repo.save(config)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="InductionFormConfig", entity_id=str(config.id)
        )
        return config
