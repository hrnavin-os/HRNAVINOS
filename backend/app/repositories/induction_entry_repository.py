"""Data access for InductionEntry documents."""
from app.models.enums import InductionStatus
from app.models.induction_entry import InductionEntry
from app.repositories.base_repository import BaseRepository

# `$eq: None` rather than a plain None because it must also match entries
# created before the field existed, where the key is absent rather than null.
NOT_CONVERTED = {"foundation_lead_id": {"$eq": None}}
CONVERTED = {"foundation_lead_id": {"$ne": None}}

# A candidate has quit when their induction call remark says so.
#
# Matched on the word rather than against a list of the exact options, and that
# is deliberate: every quit disposition contains "quit" and no other one does
# ("Quit - Before Induction Call", "DAY-3 QUIT", "Quit-G2-After Demo Class"),
# so this classifies them all without the backend holding a second copy of a
# list that lives in the frontend - and a copy is what silently stops matching
# the day somebody adds an option to one side only. New quit wordings are
# covered automatically as long as they say quit, which they must to be
# readable anyway.
QUIT_REMARK = {"call_remark": {"$regex": "quit", "$options": "i"}}
NOT_QUIT = {"call_remark": {"$not": {"$regex": "quit", "$options": "i"}}}


def status_query(status: InductionStatus) -> dict:
    """The stored-field query behind a derived InductionStatus.

    Mirrors InductionEntry.status - that property answers for one entry, this
    lets the database answer for thousands without loading them. Both read the
    same fields, so they cannot classify the same entry differently.

    Quit is excluded from the other two rather than sitting alongside them, so
    the three buckets partition the board and the cards sum to its total.
    """
    if status == InductionStatus.QUIT:
        return QUIT_REMARK
    if status == InductionStatus.MOVED_TO_FOUNDATION:
        return {**CONVERTED, **NOT_QUIT}
    return {**NOT_CONVERTED, **NOT_QUIT}


class InductionEntryRepository(BaseRepository[InductionEntry]):
    model = InductionEntry

    def __init__(self) -> None:
        super().__init__(InductionEntry)

    async def count_by_section_all(self, status: InductionStatus) -> dict[str, int]:
        """{section code: count} for the stat cards, within one tab.

        Scoped by status so the cards count the same population as the table
        beneath them - cards that keep counting the pending entries while the
        Moved tab is open are just wrong.

        Aggregated rather than counted per section in a loop, so adding a
        section doesn't add a round trip.
        """
        rows = await InductionEntry.aggregate(
            [
                {"$match": {"is_deleted": False, "section": {"$ne": None}, **status_query(status)}},
                {"$group": {"_id": "$section", "count": {"$sum": 1}}},
            ]
        ).to_list()
        return {row["_id"]: row["count"] for row in rows}

    async def list_all_for_options(
        self, *, status: InductionStatus, section: str | None = None
    ) -> list[InductionEntry]:
        """Every live entry in one tab, for building the filter dropdowns'
        option lists. Narrowed to one section for a Section Admin."""
        query: dict = {"is_deleted": False, **status_query(status)}
        if section:
            query["section"] = section
        return await InductionEntry.find(query).to_list()

    async def count_all(self, status: InductionStatus) -> int:
        return await InductionEntry.find({"is_deleted": False, **status_query(status)}).count()

    async def count_by_status(self) -> dict[str, int]:
        """One count per tab, so each tab can show how much is behind it
        without opening it."""
        return {
            status.value: await InductionEntry.find(
                {"is_deleted": False, **status_query(status)}
            ).count()
            for status in InductionStatus
        }

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
