"""Business logic for the Programs Management module.

Programs are the single source of truth behind the public form's "Program you
are planning to join?" dropdown. Everything here exists to keep that dropdown
editable at runtime without letting an admin break the pricing flow behind it.
"""
import re
import uuid

from app.exceptions.base import AlreadyExistsError, BadRequestError, NotFoundError
from app.models.program import Program
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.program_repository import ProgramRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.program_schema import ProgramCreate, ProgramUpdate
from app.services.audit_service import AuditService

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """'Recruitment + Internship' -> 'recruitment_internship'. Matches the
    shape of the original ProgramInterest enum values, so programs seeded from
    that enum keep the exact identifiers existing leads already reference."""
    return _SLUG_STRIP.sub("_", name.strip().lower()).strip("_")[:50]


class ProgramService:
    def __init__(self) -> None:
        self.programs = ProgramRepository()
        self.leads = LeadRepository()
        self.config_repo = FoundationFormConfigRepository()
        self.audit = AuditService()

    async def _validate_category(self, category: str) -> None:
        """A program's category decides which payment plans and installment
        amounts page 2 offers, so it has to name a category that exists."""
        config = await self.config_repo.get_or_create()
        valid = {c.code for c in config.categories}
        if category not in valid:
            raise BadRequestError(
                f"'{category}' is not a valid pricing category. Choose one of: {', '.join(sorted(valid))}."
            )

    async def _unique_value(self, name: str) -> str:
        base = slugify(name)
        if not base:
            raise BadRequestError("Program name must contain at least one letter or number.")
        value = base
        suffix = 2
        while await self.programs.value_exists(value):
            value = f"{base[:46]}_{suffix}"
            suffix += 1
        return value

    async def create(self, data: ProgramCreate, *, actor_id: uuid.UUID | None) -> Program:
        await self._validate_category(data.category)
        if await self.programs.name_exists(data.name):
            raise AlreadyExistsError(f"A program named '{data.name}' already exists.")

        program = Program(
            **data.model_dump(),
            value=await self._unique_value(data.name),
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.programs.create(program)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Program", entity_id=str(program.id))
        return program

    async def get(self, program_id: uuid.UUID) -> Program:
        program = await self.programs.get_by_id(program_id)
        if not program:
            raise NotFoundError("Program not found.")
        return program

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        # So the first admin to open Admin > Programs sees the four programs
        # the form has always offered, rather than an empty table.
        await self.programs.ensure_seeded()
        items, total = await self.programs.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "value"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, program_id: uuid.UUID, data: ProgramUpdate, *, actor_id: uuid.UUID | None) -> Program:
        program = await self.get(program_id)
        update_data = data.model_dump(exclude_unset=True)
        if "category" in update_data:
            await self._validate_category(update_data["category"])
        if "name" in update_data and await self.programs.name_exists(update_data["name"], exclude_id=program.id):
            raise AlreadyExistsError(f"A program named '{update_data['name']}' already exists.")
        update_data["updated_by"] = actor_id
        # `value` is intentionally never touched here: leads store it, so a
        # rename changes what staff and students see, not what's on record.
        await self.programs.update(program, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Program", entity_id=str(program.id), changes=update_data
        )
        return program

    async def delete(self, program_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        program = await self.get(program_id)
        lead_count = await self.leads.count_by_program(program.value)
        if lead_count > 0:
            raise BadRequestError(
                f"Can't delete '{program.name}' - {lead_count} lead(s) selected it. "
                "Deactivate it instead to remove it from the form while keeping those records intact."
            )
        await self.programs.delete(program)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Program", entity_id=str(program.id))
