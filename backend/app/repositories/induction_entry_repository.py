"""Data access for InductionEntry documents."""
from app.models.induction_entry import InductionEntry
from app.repositories.base_repository import BaseRepository


class InductionEntryRepository(BaseRepository[InductionEntry]):
    model = InductionEntry

    def __init__(self) -> None:
        super().__init__(InductionEntry)

    async def count_by_section_all(self) -> dict[str, int]:
        """{section code: count} across every live entry, for the stat cards.

        Aggregated rather than counted per section in a loop, so adding a
        section doesn't add a round trip.
        """
        rows = await InductionEntry.aggregate(
            [
                {"$match": {"is_deleted": False, "section": {"$ne": None}}},
                {"$group": {"_id": "$section", "count": {"$sum": 1}}},
            ]
        ).to_list()
        return {row["_id"]: row["count"] for row in rows}

    async def count_all(self) -> int:
        return await InductionEntry.find({"is_deleted": False}).count()
