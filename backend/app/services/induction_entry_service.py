"""Business logic for the Induction Call Form."""
import uuid
from datetime import date

from app.exceptions.base import NotFoundError
from app.models.induction_entry import InductionEntry
from app.models.user import User
from app.repositories.induction_entry_repository import InductionEntryRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.induction_entry_schema import (
    InductionEntryCreate,
    InductionEntryResponse,
    InductionEntryUpdate,
)
from app.services.audit_service import AuditService

# The batch sequence is anchored, not enumerated: August 2026 is Batch-28 and
# every following month is one higher. Anchoring rather than hardcoding a
# lookup means the numbering keeps going for future months and years with no
# further changes here - Dec 2026 is 32, Jan 2027 is 33, and so on.
BATCH_ANCHOR = (2026, 8)
BATCH_ANCHOR_NUMBER = 28


def batch_for(registration_date: date) -> str:
    """'Batch-N' for the month a student registered in.

    Derived from the registration date rather than today, so a row keeps the
    batch it was registered into once the month rolls over.
    """
    anchor_year, anchor_month = BATCH_ANCHOR
    months = (registration_date.year - anchor_year) * 12 + (registration_date.month - anchor_month)
    return f"Batch-{BATCH_ANCHOR_NUMBER + months}"


class InductionEntryService:
    def __init__(self) -> None:
        self.entries = InductionEntryRepository()
        self.roles = RoleRepository()
        self.users = UserRepository()
        self.audit = AuditService()

    async def _section_admin_rota(self) -> list[tuple[User, str]]:
        """Every active Section Admin paired with their section, in a stable
        order.

        The section is carried alongside because it lives on the Role, not the
        User - there is no user.scoped_section to read back later.

        Ordered by their role's creation then their own, so the rota is the
        same list on every request; a round-robin over an unordered query
        isn't a round-robin, it's a shuffle.
        """
        rota: list[tuple[User, str]] = []
        for role in await self.roles.list_scoped():
            users, _ = await self.users.list(
                page=1, page_size=1000, filters={"role_id": role.id, "is_active": True}
            )
            for user in sorted(users, key=lambda u: (u.created_at, str(u.id))):
                rota.append((user, role.scoped_section))
        return rota

    async def _next_assignee(self) -> tuple[User, str] | tuple[None, None]:
        """Picks the next Section Admin in the rotation.

        The cursor is the total number of induction entries ever created,
        including soft-deleted ones. Counting only live rows would make the
        index go backwards when one is deleted and hand the same person two
        in a row; soft deletes never leave the collection, so this only ever
        climbs.
        """
        rota = await self._section_admin_rota()
        if not rota:
            return None, None
        created_so_far = await InductionEntry.find({}).count()
        return rota[created_so_far % len(rota)]

    async def to_response(self, entry: InductionEntry) -> InductionEntryResponse:
        # model_dump() also carries the BaseDocument fields (is_deleted,
        # created_by, revision_id...); the response schema ignores what it
        # doesn't declare, so they're harmless here.
        assignee = await self.users.get_by_id(entry.assigned_to) if entry.assigned_to else None
        return InductionEntryResponse(
            **entry.model_dump(),
            batch=batch_for(entry.registration_date),
            assigned_to_name=f"{assignee.first_name} {assignee.last_name}".strip() if assignee else None,
        )

    async def create(self, data: InductionEntryCreate, *, actor_id: uuid.UUID | None) -> InductionEntry:
        # Assignment happens here rather than being a field on the form: the
        # team keying these in from WhatsApp shouldn't have to remember whose
        # turn it is, and shouldn't be able to skew the rota by choosing.
        assignee, section = await self._next_assignee()
        entry = InductionEntry(
            **data.model_dump(),
            assigned_to=assignee.id if assignee else None,
            section=section,
            created_by=actor_id,
            updated_by=actor_id,
        )
        await self.entries.create(entry)
        await self.audit.record(
            user_id=actor_id,
            action="CREATE",
            entity_type="InductionEntry",
            entity_id=str(entry.id),
            changes={"assigned_to": str(assignee.id) if assignee else None, "section": section},
        )
        return entry

    async def get(self, entry_id: uuid.UUID) -> InductionEntry:
        entry = await self.entries.get_by_id(entry_id)
        if not entry:
            raise NotFoundError("Induction entry not found.")
        return entry

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.entries.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "phone", "email", "sales_person", "lead_source", "category"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(
        self, entry_id: uuid.UUID, data: InductionEntryUpdate, *, actor_id: uuid.UUID | None
    ) -> InductionEntry:
        entry = await self.get(entry_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.entries.update(entry, update_data)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="InductionEntry",
            entity_id=str(entry.id),
            changes=update_data,
        )
        return entry

    async def delete(self, entry_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        entry = await self.get(entry_id)
        await self.entries.delete(entry)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="InductionEntry", entity_id=str(entry.id)
        )
