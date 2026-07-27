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
    async def count_total(self) -> int:
        return await Lead.find({"is_deleted": False, "reviewed": {"$ne": False}}).count()

    async def count_by_status(self) -> dict[str, int]:
        counts = await Lead.aggregate(
            [
                {"$match": {"is_deleted": False, "reviewed": {"$ne": False}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]
        ).to_list()
        by_status = {row["_id"]: row["count"] for row in counts}
        return {status.value: by_status.get(status.value, 0) for status in LeadStatus}

    async def list_pending_review(self) -> list[Lead]:
        return await Lead.find({"is_deleted": False, "reviewed": False}).sort("-created_at").to_list()
