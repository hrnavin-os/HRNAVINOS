"""Data access for InductionEntry documents."""
from app.models.induction_entry import InductionEntry
from app.repositories.base_repository import BaseRepository

# An entry that has already been linked to a Foundation lead has moved on to
# the Foundation board, so it is no longer part of the active Induction list,
# its stat cards, or its filter options. `$eq: None` rather than a plain None
# because it must also match entries created before the field existed, where
# the key is absent rather than null.
NOT_CONVERTED = {"foundation_lead_id": {"$eq": None}}


class InductionEntryRepository(BaseRepository[InductionEntry]):
    model = InductionEntry

    def __init__(self) -> None:
        super().__init__(InductionEntry)

    async def count_by_section_all(self) -> dict[str, int]:
        """{section code: count} across every live, unconverted entry, for the
        stat cards.

        Aggregated rather than counted per section in a loop, so adding a
        section doesn't add a round trip.
        """
        rows = await InductionEntry.aggregate(
            [
                {"$match": {"is_deleted": False, "section": {"$ne": None}, **NOT_CONVERTED}},
                {"$group": {"_id": "$section", "count": {"$sum": 1}}},
            ]
        ).to_list()
        return {row["_id"]: row["count"] for row in rows}

    async def list_all_for_options(self, *, section: str | None = None) -> list[InductionEntry]:
        """Every live, unconverted entry, for building the filter dropdowns'
        option lists. Narrowed to one section for a Section Admin."""
        query: dict = {"is_deleted": False, **NOT_CONVERTED}
        if section:
            query["section"] = section
        return await InductionEntry.find(query).to_list()

    async def count_all(self) -> int:
        return await InductionEntry.find({"is_deleted": False, **NOT_CONVERTED}).count()

    async def find_unconverted_by_phone(self, phone_normalized: str) -> InductionEntry | None:
        """The induction entry a Foundation Form submission with this number
        should link to, if there is one.

        Already-converted entries are excluded so a second person reusing a
        number - or a resubmission - can't be linked to a record that has
        already moved to Foundation.

        Newest registration wins when the same number was keyed in more than
        once: that's the round of induction the student actually just came
        through, so it's the one whose details belong with the submission.
        """
        matches = await (
            InductionEntry.find({"is_deleted": False, "phone_normalized": phone_normalized, **NOT_CONVERTED})
            .sort("-registration_date", "-created_at")
            .limit(1)
            .to_list()
        )
        return matches[0] if matches else None

    async def count_converted(self) -> int:
        return await InductionEntry.find(
            {"is_deleted": False, "foundation_lead_id": {"$ne": None}}
        ).count()
