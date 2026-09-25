"""The Super Admin dashboard's numbers.

The old overview counted Students, Tutors, Tickets and Placements - modules
this institute doesn't run on, so it was a page of zeros. What actually moves
here is the funnel: Induction calls, Foundation leads through their stages,
and the fees collected against them. This reads exactly those, from the same
collections and by the same rules the boards and the Statistics page use, so a
figure here never disagrees with the page it summarises.

Months and days are the institute's (IST), not the server's: a lead that lands
at 1am on the 1st belongs to the new month, which in UTC it wouldn't.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.models.enums import LeadStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.schemas.dashboard_schema import (
    CourseRow,
    DailyCount,
    DashboardInsights,
    DashboardKpis,
    DueRow,
    MonthCount,
    RecentLead,
    StageCount,
)
from app.services.lead_service import _INSTALLMENTS_COLLECTED

IST = timezone(timedelta(hours=5, minutes=30))
TREND_DAYS = 30

# The pipeline in board order, so the funnel reads top to bottom the way a
# lead travels. Quit is last: it's the exit, not a step.
PIPELINE = [
    LeadStatus.NEW_LEAD,
    LeadStatus.RNR,
    LeadStatus.PRE_SCREENING,
    LeadStatus.FINANCIAL_APPROVAL,
    LeadStatus.BATCH_CONFIRMATION,
    LeadStatus.LOST,
]


def _money(value) -> Decimal:
    if value is None:
        return Decimal(0)
    if hasattr(value, "to_decimal"):
        return value.to_decimal()
    return Decimal(str(value))


def _month_bounds(today: date) -> tuple[date, date]:
    this_start = today.replace(day=1)
    last_start = (this_start - timedelta(days=1)).replace(day=1)
    return this_start, last_start


def _ist_midnight(day: date) -> datetime:
    """The UTC instant an IST calendar day starts - what created_at compares to."""
    return datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)


class DashboardInsightsService:
    async def get(self, *, section: str | None = None) -> DashboardInsights:
        today = datetime.now(IST).date()
        this_start, last_start = _month_bounds(today)

        leads: dict = {"is_deleted": False, "reviewed": {"$ne": False}}
        entries: dict = {"is_deleted": False}
        if section:
            leads["section"] = section
            entries["section"] = section

        pipeline = await self._pipeline(leads)
        by_status = {row.status: row.count for row in pipeline}
        collected, outstanding = await self._money(leads)
        dues, overdue_count, overdue_amount = await self._dues(leads, today)

        kpis = DashboardKpis(
            induction=await self._induction_months(entries, this_start, last_start),
            foundation=await self._lead_months(leads, this_start, last_start),
            moved_to_foundation=await InductionEntry.find(
                {**entries, "foundation_lead_id": {"$ne": None}}
            ).count(),
            batch_confirmed=by_status.get(LeadStatus.BATCH_CONFIRMATION.value, 0),
            quit=by_status.get(LeadStatus.LOST.value, 0),
            collected=collected,
            outstanding=outstanding,
            overdue_count=overdue_count,
            overdue_amount=overdue_amount,
        )
        return DashboardInsights(
            kpis=kpis,
            pipeline=pipeline,
            trend=await self._trend(leads, entries, today),
            top_courses=await self._top_courses(leads),
            upcoming_dues=dues[:6],
            recent_leads=await self._recent(leads),
        )

    async def _induction_months(self, match: dict, this_start: date, last_start: date) -> MonthCount:
        # registration_date is stored as the day at midnight, no zone - the day
        # the form says, which is already the institute's own calendar day.
        def since(start: date, end: date | None = None) -> dict:
            window = {"$gte": datetime.combine(start, time.min)}
            if end:
                window["$lt"] = datetime.combine(end, time.min)
            return {**match, "registration_date": window}

        return MonthCount(
            total=await InductionEntry.find(match).count(),
            this_month=await InductionEntry.find(since(this_start)).count(),
            last_month=await InductionEntry.find(since(last_start, this_start)).count(),
        )

    async def _lead_months(self, match: dict, this_start: date, last_start: date) -> MonthCount:
        this_utc, last_utc = _ist_midnight(this_start), _ist_midnight(last_start)
        return MonthCount(
            total=await Lead.find(match).count(),
            this_month=await Lead.find({**match, "created_at": {"$gte": this_utc}}).count(),
            last_month=await Lead.find({**match, "created_at": {"$gte": last_utc, "$lt": this_utc}}).count(),
        )

    async def _pipeline(self, match: dict) -> list[StageCount]:
        rows = await Lead.aggregate([{"$match": match}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list()
        counts = {row["_id"]: row["count"] for row in rows}
        return [StageCount(status=stage.value, count=counts.get(stage.value, 0)) for stage in PIPELINE]

    async def _money(self, match: dict) -> tuple[Decimal, Decimal]:
        """Collected across every lead, and what's still owed on the ones in
        play. Collected reads the payment collection where it recorded anything
        and the old Paying Amount field otherwise - the same rule as the
        Statistics page's collected figure."""
        fee = {"$reduce": {"input": {"$ifNull": ["$installments", []]}, "initialValue": 0.0,
                           "in": {"$add": ["$$value", {"$toDouble": {"$ifNull": ["$$this.amount", 0]}}]}}}
        rows = await Lead.aggregate(
            [
                {"$match": match},
                {"$project": {"status": 1, "fee": fee, "recorded": _INSTALLMENTS_COLLECTED,
                              "manual": {"$toDouble": {"$ifNull": ["$paying_amount", 0]}}}},
                {
                    "$group": {
                        "_id": None,
                        "collected": {"$sum": {"$cond": [{"$gt": ["$recorded", 0]}, "$recorded", "$manual"]}},
                        "outstanding": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$status", LeadStatus.LOST.value]},
                                    0,
                                    {"$max": [{"$subtract": ["$fee", "$recorded"]}, 0]},
                                ]
                            }
                        },
                    }
                },
            ]
        ).to_list()
        row = rows[0] if rows else {}
        return (
            Decimal(str(round(row.get("collected", 0), 2))),
            Decimal(str(round(row.get("outstanding", 0), 2))),
        )

    async def _dues(self, match: dict, today: date) -> tuple[list[DueRow], int, Decimal]:
        """Every unpaid installment with a date on it - a part-payment's
        balance or a scheduled second payment - soonest first, so the overdue
        ones lead."""
        leads = await Lead.find(
            {
                **match,
                "status": {"$ne": LeadStatus.LOST.value},
                "installments": {"$elemMatch": {"paid": False, "scheduled_at": {"$ne": None}}},
            }
        ).to_list()
        rows: list[DueRow] = []
        overdue_count, overdue_amount = 0, Decimal(0)
        for lead in leads:
            for installment in lead.installments:
                if installment.paid or not installment.scheduled_at:
                    continue
                owed = _money(installment.amount) - installment.collected()
                if owed <= 0:
                    continue
                overdue = installment.scheduled_at < today
                if overdue:
                    overdue_count += 1
                    overdue_amount += owed
                rows.append(
                    DueRow(
                        lead_id=str(lead.id),
                        name=lead.name,
                        label=installment.label,
                        amount=owed,
                        due=installment.scheduled_at.isoformat(),
                        overdue=overdue,
                    )
                )
        rows.sort(key=lambda row: row.due)
        return rows, overdue_count, overdue_amount

    async def _trend(self, leads: dict, entries: dict, today: date) -> list[DailyCount]:
        start = today - timedelta(days=TREND_DAYS - 1)
        lead_rows = await Lead.aggregate(
            [
                {"$match": {**leads, "created_at": {"$gte": _ist_midnight(start)}}},
                {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at",
                                                      "timezone": "+05:30"}}, "count": {"$sum": 1}}},
            ]
        ).to_list()
        entry_rows = await InductionEntry.aggregate(
            [
                {"$match": {**entries, "registration_date": {"$gte": datetime.combine(start, time.min)}}},
                {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$registration_date"}},
                            "count": {"$sum": 1}}},
            ]
        ).to_list()
        foundation = {row["_id"]: row["count"] for row in lead_rows}
        induction = {row["_id"]: row["count"] for row in entry_rows}
        # Every day in the window, including the quiet ones - a gap in the line
        # is a day nothing happened, and dropping it would redraw the shape.
        days = [(start + timedelta(days=offset)).isoformat() for offset in range(TREND_DAYS)]
        return [DailyCount(day=day, induction=induction.get(day, 0), foundation=foundation.get(day, 0)) for day in days]

    async def _top_courses(self, match: dict) -> list[CourseRow]:
        rows = await Lead.aggregate(
            [
                {"$match": {**match, "course_interest": {"$nin": [None, ""]}}},
                {
                    "$group": {
                        "_id": "$course_interest",
                        "leads": {"$sum": 1},
                        "confirmed": {
                            "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.BATCH_CONFIRMATION.value]}, 1, 0]}
                        },
                    }
                },
                {"$sort": {"leads": -1, "_id": 1}},
                {"$limit": 5},
            ]
        ).to_list()
        return [CourseRow(course=row["_id"], leads=row["leads"], confirmed=row["confirmed"]) for row in rows]

    async def _recent(self, match: dict) -> list[RecentLead]:
        leads = await Lead.find(match).sort("-created_at").limit(6).to_list()
        return [
            RecentLead(
                lead_id=str(lead.id),
                name=lead.name,
                course=lead.course_interest,
                status=lead.status.value if hasattr(lead.status, "value") else str(lead.status),
                created_at=lead.created_at.isoformat(),
            )
            for lead in leads
        ]
