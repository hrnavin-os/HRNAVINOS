"""Data access for Program documents."""
import uuid

from app.models.program import Program
from app.repositories.base_repository import BaseRepository
from app.services.foundation_form_pricing import CATEGORY_BY_PROGRAM, PROGRAM_LABELS


class ProgramRepository(BaseRepository[Program]):
    model = Program

    def __init__(self) -> None:
        super().__init__(Program)

    async def ensure_seeded(self) -> None:
        """Create the four original programs if the collection is empty.

        scripts/seed_db.py does this too, but deploy.sh doesn't run the seed -
        so without this, deploying to an existing database would leave the
        public form's program dropdown blank until someone remembered to seed
        by hand. Same lazy-backfill-on-first-read approach
        FoundationFormConfigRepository.get_or_create() uses for `sections`.

        Only fires on a genuinely empty collection, so an admin who has since
        deleted every program doesn't get them silently resurrected... which is
        precisely why it checks including soft-deleted rows.
        """
        if await Program.find_one({}) is not None:
            return
        for index, (program, label) in enumerate(PROGRAM_LABELS.items()):
            await Program(
                name=label,
                value=program.value,
                category=CATEGORY_BY_PROGRAM[program],
                is_active=True,
                order=index,
            ).insert()

    async def value_exists(self, value: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        """Deliberately spans soft-deleted rows too: `value` is written onto
        leads, so a retired program's identifier must never be handed out
        again to a different program."""
        query: dict = {"value": value}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Program.find_one(query) is not None

    async def name_exists(self, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"name": name, "is_deleted": False}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Program.find_one(query) is not None

    async def get_by_value(self, value: str) -> Program | None:
        return await Program.find_one({"value": value, "is_deleted": False})

    async def list_active(self) -> list[Program]:
        """Every active program in dropdown order — what the public form and
        the CRM's manual plan-assignment both render."""
        await self.ensure_seeded()
        return await Program.find({"is_active": True, "is_deleted": False}).sort("+order", "+name").to_list()
