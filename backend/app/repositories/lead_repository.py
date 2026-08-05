"""Data access for Lead documents."""
from app.models.enums import LeadStatus
from app.models.lead import Lead
from app.repositories.base_repository import BaseRepository


class LeadRepository(BaseRepository[Lead]):
    model = Lead

    def __init__(self) -> None:
        super().__init__(Lead)

    # Leads inserted before the `reviewed` field existed have no such key stored in
    # Mongo at all, so we match "not explicitly False" rather than "== True" —
    # otherwise an exact-match query would silently exclude every pre-existing lead.
    async def count_total(self, *, section: str | None = None) -> int:
        query = {"is_deleted": False, "reviewed": {"$ne": False}}
        if section:
            query["section"] = section
        return await Lead.find(query).count()

    async def count_by_status(self, *, section: str | None = None) -> dict[str, int]:
        match = {"is_deleted": False, "reviewed": {"$ne": False}}
        if section:
            match["section"] = section
        counts = await Lead.aggregate(
            [
                {"$match": match},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]
        ).to_list()
        by_status = {row["_id"]: row["count"] for row in counts}
        return {status.value: by_status.get(status.value, 0) for status in LeadStatus}

    async def list_pending_review(self) -> list[Lead]:
        return await Lead.find({"is_deleted": False, "reviewed": False}).sort("-created_at").to_list()

    async def count_by_section(self, code: str) -> int:
        return await Lead.find({"is_deleted": False, "section": code}).count()

    async def count_by_program(self, value: str) -> int:
        """Leads that picked this program — deleting it would orphan their
        program_interest, so ProgramService blocks the delete on a non-zero
        count and points the admin at deactivating instead."""
        return await Lead.find({"is_deleted": False, "program_interest": value}).count()

    async def count_by_section_all(self) -> dict[str, int]:
        counts = await Lead.aggregate(
            [
                {"$match": {"is_deleted": False, "reviewed": {"$ne": False}, "section": {"$ne": None}}},
                {"$group": {"_id": "$section", "count": {"$sum": 1}}},
            ]
        ).to_list()
        return {row["_id"]: row["count"] for row in counts}

    async def distinct_course_interests(self) -> list[str]:
        # Beanie's FindMany query builder has no .distinct() - go through the
        # underlying Motor collection directly.
        values = await Lead.get_motor_collection().distinct(
            "course_interest", {"is_deleted": False, "reviewed": {"$ne": False}, "course_interest": {"$ne": None}}
        )
        return sorted({v for v in values if v})
