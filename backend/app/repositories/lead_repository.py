"""Data access for Lead documents."""
from datetime import date, datetime

from app.models.enums import LeadSource, LeadStatus
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

    async def list_due_follow_ups(self, *, now: datetime, limit: int = 200) -> list[Lead]:
        """Leads whose scheduled follow-up has come round.

        `$lte now` rather than "is today": if nobody opened the app on the day
        itself, the reminder still has to appear - a follow-up that silently
        expired because no one was logged in is the failure this is for. Lost
        leads are excluded; there's nothing left to follow up.
        """
        return await (
            Lead.find(
                {
                    "is_deleted": False,
                    "reviewed": {"$ne": False},
                    "status": {"$ne": LeadStatus.LOST.value},
                    "follow_up_at": {"$ne": None, "$lte": now},
                }
            )
            .sort("follow_up_at")
            .limit(limit)
            .to_list()
        )

    async def list_due_installments(self, *, today: date, limit: int = 200) -> list[Lead]:
        """Leads carrying an unpaid installment whose scheduled date has come
        round - the second half of a two-shot plan, in practice.

        Matches on the array as a whole and lets the caller pick out which
        installments are actually due: $elemMatch would return the lead but not
        tell us which entry matched, and a plan can have more than one.
        """
        return await (
            Lead.find(
                {
                    "is_deleted": False,
                    "reviewed": {"$ne": False},
                    "status": {"$ne": LeadStatus.LOST.value},
                    "installments": {
                        "$elemMatch": {"paid": False, "scheduled_at": {"$ne": None, "$lte": today}}
                    },
                }
            )
            .limit(limit)
            .to_list()
        )

    async def find_by_phone_normalized(self, phone_normalized: str) -> Lead | None:
        """The existing lead for this mobile number, if any.

        Backs duplicate prevention on the public Foundation Form: a resubmit, a
        refresh mid-submission, or the same person filling the form twice must
        update this lead rather than create a second one.

        Deliberately not restricted to `source == foundation_form`. A lead
        someone keyed in by hand is still that person - creating a second
        record beside it would be exactly the duplicate this is meant to stop.

        Most recent wins if history already contains duplicates for a number,
        since that's the record staff are currently working.
        """
        matches = await (
            Lead.find({"is_deleted": False, "phone_normalized": phone_normalized})
            .sort("-created_at")
            .limit(1)
            .to_list()
        )
        return matches[0] if matches else None

    async def count_by_induction_match(self) -> dict[str, int]:
        """{"matched": n, "unmatched": n} across live Foundation Form leads.

        Only form submissions are counted: a lead typed straight into the CRM
        never went through an induction call, so calling it "unmatched" would
        read as a failed match rather than a different intake route.
        """
        rows = await Lead.aggregate(
            [
                {
                    "$match": {
                        "is_deleted": False,
                        "reviewed": {"$ne": False},
                        "source": LeadSource.FOUNDATION_FORM.value,
                    }
                },
                {
                    "$group": {
                        "_id": {"$cond": [{"$ifNull": ["$induction_entry_id", False]}, "matched", "unmatched"]},
                        "count": {"$sum": 1},
                    }
                },
            ]
        ).to_list()
        counts = {row["_id"]: row["count"] for row in rows}
        return {"matched": counts.get("matched", 0), "unmatched": counts.get("unmatched", 0)}

    async def distinct_course_interests(self) -> list[str]:
        # Beanie's FindMany query builder has no .distinct() - go through the
        # underlying Motor collection directly.
        values = await Lead.get_motor_collection().distinct(
            "course_interest", {"is_deleted": False, "reviewed": {"$ne": False}, "course_interest": {"$ne": None}}
        )
        return sorted({v for v in values if v})
