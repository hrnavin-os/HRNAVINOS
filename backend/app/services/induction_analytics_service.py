"""The five decision boards behind the induction analytics dashboard.

Split out from InductionEntryService, which owns the board's own reads and
writes: this module never touches an entry, it only counts them, and keeping
the two apart means the pipelines here can grow without burying the CRUD.

Everything is aggregated in the database rather than by loading entries and
counting in Python. The dashboard is meant to keep working at a few thousand
rows, and the counts are the whole payload - the entries themselves never
travel.

One rule runs through all five boards: a value nobody filled in is a named row
("Not set"), never a dropped one. How much of the data is missing is itself a
finding, and a board that quietly drops it reports a cleaner business than the
one that exists.
"""
import uuid
from datetime import date, datetime, time, timedelta

from app.models.induction_entry import InductionEntry
from app.models.user import User
from app.services.induction_entry_service import batch_for

# The three facts every board asks about an entry, as aggregation expressions
# so they can be reused inside a $sum, a $group key or a $match alike.
#
# Quit is matched on the word rather than against a list of the exact remarks -
# the same rule the board's tabs use, so a dashboard and a tab can't classify
# the same entry differently. See InductionEntryRepository.
QUIT = {"$regexMatch": {"input": {"$ifNull": ["$call_remark", ""]}, "regex": "quit", "options": "i"}}
MOVED = {"$ne": [{"$ifNull": ["$foundation_lead_id", None]}, None]}
CALLED = {"$ne": [{"$ifNull": ["$call_remark", ""]}, ""]}

# The four pages of the post-call form, as they are stored.
DETAIL_GROUPS = ("qualification", "placement", "remarks", "other_details")

# How long an uncalled entry has been waiting. Ordered oldest-last so the board
# can read them as a ramp; the last bucket is open-ended because "over a
# fortnight" is one answer however long it has actually been.
AGE_BUCKETS = [
    ("0-3 days", 0, 3),
    ("4-7 days", 4, 7),
    ("8-14 days", 8, 14),
    ("15+ days", 15, None),
]


def _group_has_an_answer(group: str) -> dict:
    """True when any field of one post-call page has been filled in.

    Written over $objectToArray rather than as a list of field names so adding
    a question to the form doesn't silently stop counting - the frontend's
    hasDetails() reads the same way, and the two would drift apart the day one
    of them was updated alone.
    """
    return {
        "$anyElementTrue": {
            "$map": {
                "input": {"$objectToArray": {"$ifNull": [f"${group}", {}]}},
                "as": "field",
                "in": {
                    "$and": [
                        {"$ne": ["$$field.v", None]},
                        {"$ne": ["$$field.v", ""]},
                    ]
                },
            }
        }
    }


DETAILED = {"$or": [_group_has_an_answer(group) for group in DETAIL_GROUPS]}


def _count_if(condition: dict) -> dict:
    return {"$sum": {"$cond": [condition, 1, 0]}}


class InductionAnalyticsService:
    # ---------- shared scope ----------
    @staticmethod
    def match_stage(
        *, section: str | None = None, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        """The slicer bar, as a $match.

        Every board is built on this one stage, so the five of them can never
        end up counting different populations - which is the failure that makes
        a dashboard untrustworthy rather than merely wrong.
        """
        match: dict = {"is_deleted": False}
        if section:
            match["section"] = section
        # Registration dates are stored as midnight datetimes, so the bounds
        # are converted here rather than left as dates: a pipeline stage isn't
        # passed through the ODM's encoder the way a find() query is, and BSON
        # has no date type to fall back on. Midnight on `date_to` still
        # includes that whole day, because every stored value is midnight.
        window: dict = {}
        if date_from:
            window["$gte"] = datetime.combine(date_from, time.min)
        if date_to:
            window["$lte"] = datetime.combine(date_to, time.min)
        if window:
            match["registration_date"] = window
        return match

    async def dashboard(
        self, *, section: str | None = None, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        match = self.match_stage(section=section, date_from=date_from, date_to=date_to)
        funnel = await self.funnel(match)
        return {
            "total": funnel["registered"],
            "funnel": funnel,
            "calls": await self.calls(match),
            "team": await self.team(match),
            "channels": await self.channels(match),
            "trend": await self.trend(match, date_from=date_from, date_to=date_to),
        }

    # ---------- 1. Funnel ----------
    async def funnel(self, match: dict) -> dict:
        """Registered - called - written up - moved, and what leaked at each step.

        Quit is counted alongside rather than as a stage: somebody can quit
        before the call or after the session, so it isn't a point on the line -
        it is the leak the line is measured against.
        """
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": None,
                        "registered": {"$sum": 1},
                        "called": _count_if(CALLED),
                        "detailed": _count_if(DETAILED),
                        "moved": _count_if(MOVED),
                        "quit": _count_if(QUIT),
                    }
                },
            ]
        ).to_list()
        row = rows[0] if rows else {}
        counts = {key: row.get(key, 0) for key in ("registered", "called", "detailed", "moved", "quit")}
        stages = [
            ("registered", "Registered"),
            ("called", "Call remark set"),
            ("detailed", "Post-call form filled"),
            ("moved", "Moved to Foundation"),
        ]
        registered = counts["registered"]
        return {
            **counts,
            # Still in the queue: called or not, they have neither crossed to
            # Foundation nor walked away.
            "in_progress": registered - counts["moved"] - counts["quit"],
            "stages": [
                {
                    "key": key,
                    "label": label,
                    "count": counts[key],
                    # Against the top of the funnel, not against the previous
                    # stage: "72% of everyone registered" is the number a
                    # decision gets made on, and step-to-step rates hide a
                    # stage that leaks by flattering the one after it.
                    "share": _share(counts[key], registered),
                }
                for key, label in stages
            ],
        }

    # ---------- 2. Calls ----------
    async def calls(self, match: dict) -> dict:
        """Every remark that was actually used, plus the two things the remarks
        can't say: how many entries nobody has recorded a call on at all, and
        how long those have been waiting."""
        remarks = await self._breakdown(match, "$call_remark")
        uncalled = [row for row in remarks if row["value"] == "Not set"]

        waiting = await InductionEntry.aggregate(
            [
                # The working queue only. An entry that moved or quit is
                # finished business, and leaving it in would make the backlog
                # look worse the more successful the board had been.
                {"$match": {**match, "$expr": {"$and": [{"$not": [CALLED]}, {"$not": [MOVED]}]}}},
                {
                    "$group": {
                        "_id": {
                            "$switch": {
                                "branches": [
                                    {
                                        "case": {"$lte": [self._age_in_days(), upper]},
                                        "then": label,
                                    }
                                    for label, _, upper in AGE_BUCKETS
                                    if upper is not None
                                ],
                                "default": AGE_BUCKETS[-1][0],
                            }
                        },
                        "count": {"$sum": 1},
                    }
                },
            ]
        ).to_list()
        by_bucket = {row["_id"]: row["count"] for row in waiting}

        return {
            "remarks": remarks,
            "uncalled": uncalled[0]["count"] if uncalled else 0,
            # Every bucket, including the empty ones: the shape of the backlog
            # is the finding, and a missing bucket reads as a bucket that can't
            # happen rather than one nothing is in.
            "waiting": [{"bucket": label, "count": by_bucket.get(label, 0)} for label, _, _ in AGE_BUCKETS],
        }

    @staticmethod
    def _age_in_days() -> dict:
        return {"$dateDiff": {"startDate": "$registration_date", "endDate": "$$NOW", "unit": "day"}}

    # ---------- 3. Team ----------
    async def team(self, match: dict) -> dict:
        """The two people on an entry: the sales person the form credits, and
        the Section Admin the round-robin assigned it to. Kept apart because
        they answer different questions - who brought them in, and who is
        working them now."""
        assignees = await self._breakdown(match, "$assigned_to")
        names = await self._assignee_names(assignees)
        return {
            "sales_person": await self._breakdown(match, "$sales_person"),
            "assignee": [{**row, "value": names.get(row["value"], "Unassigned")} for row in assignees],
        }

    async def _assignee_names(self, rows: list[dict]) -> dict:
        """{id: name} for the assignees present in the result.

        Looked up in one query for the whole board rather than per row, and
        anyone whose account has since been deleted keeps their rows under
        "Unassigned" rather than vanishing from a total that still counts them.
        """
        ids = []
        for row in rows:
            try:
                ids.append(uuid.UUID(row["value"]))
            except ValueError:
                continue  # "Not set" - nobody was assigned, so there is no name to find.
        if not ids:
            return {}
        users = await User.find({"_id": {"$in": ids}}).to_list()
        return {str(user.id): user.full_name for user in users}

    # ---------- 4. Channels ----------
    async def channels(self, match: dict) -> dict:
        return {
            "lead_source": await self._breakdown(match, "$lead_source"),
            "category": await self._breakdown(match, "$category"),
            "payment_mode": await self._breakdown(match, "$payment_mode"),
        }

    # ---------- 5. Trend ----------
    async def trend(
        self, match: dict, *, date_from: date | None = None, date_to: date | None = None
    ) -> dict:
        """Registrations over time, with what became of them.

        The bucket size follows the window rather than being fixed: a fortnight
        in months is one bar, and two years in days is a thousand. Whatever the
        window, the batch table underneath always groups by month, because the
        batch is a month and comparing batches is the question it answers.
        """
        span = await self._span(match)
        granularity = self._granularity(date_from, date_to, span)

        points = await self._series(match, granularity)
        months = await self._series(match, "month")
        return {
            "granularity": granularity,
            # Gaps filled, so a quiet week is a dip rather than a straight line
            # drawn through it as if it never happened.
            "points": _fill_gaps(points, granularity),
            "batches": [
                {
                    "batch": batch_for(point["period"]),
                    "month": point["period"].isoformat(),
                    "registered": point["registered"],
                    "moved": point["moved"],
                    "quit": point["quit"],
                }
                for point in months
            ],
        }

    async def _series(self, match: dict, granularity: str) -> list[dict]:
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": {"$dateTrunc": {"date": "$registration_date", "unit": granularity}},
                        "registered": {"$sum": 1},
                        "moved": _count_if(MOVED),
                        "quit": _count_if(QUIT),
                    }
                },
                {"$sort": {"_id": 1}},
            ]
        ).to_list()
        return [
            {
                "period": row["_id"].date() if hasattr(row["_id"], "date") else row["_id"],
                "registered": row["registered"],
                "moved": row["moved"],
                "quit": row["quit"],
            }
            for row in rows
            if row["_id"] is not None
        ]

    async def _span(self, match: dict) -> int:
        """Days between the first and last registration in scope, for picking
        the bucket size when the slicer hasn't set a window."""
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {"$group": {"_id": None, "first": {"$min": "$registration_date"}, "last": {"$max": "$registration_date"}}},
            ]
        ).to_list()
        if not rows or not rows[0].get("first"):
            return 0
        first, last = rows[0]["first"], rows[0]["last"]
        return (last - first).days

    @staticmethod
    def _granularity(date_from: date | None, date_to: date | None, span: int) -> str:
        if date_from and date_to:
            span = (date_to - date_from).days
        if span <= 45:
            return "day"
        if span <= 400:
            return "week"
        return "month"

    # ---------- shared ----------
    async def _breakdown(self, match: dict, field: str) -> list[dict]:
        """Counts per distinct value of one field, each with how many of them
        went on to Foundation and how many quit.

        The bare count is never the interesting number: it isn't how many came
        from Instagram, it's how many of those converted and how many walked.
        """
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": field,
                        "count": {"$sum": 1},
                        "moved": _count_if(MOVED),
                        "quit": _count_if(QUIT),
                        "uncalled": _count_if({"$not": [CALLED]}),
                    }
                },
                {"$sort": {"count": -1}},
            ]
        ).to_list()
        return [
            {
                "value": str(row["_id"]) if row["_id"] not in (None, "") else "Not set",
                "count": row["count"],
                "moved": row["moved"],
                "quit": row["quit"],
                "uncalled": row["uncalled"],
            }
            for row in rows
        ]


def _share(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _fill_gaps(points: list[dict], granularity: str) -> list[dict]:
    """A period nobody registered in is a zero, not a missing point.

    Without this the line is drawn straight from the period before the gap to
    the period after it, which reads as steady traffic across a week that had
    none.
    """
    if not points:
        return []
    step = {"day": timedelta(days=1), "week": timedelta(weeks=1)}.get(granularity)
    filled: list[dict] = []
    for point in points:
        if filled and step:
            cursor = filled[-1]["period"] + step
            while cursor < point["period"]:
                filled.append({"period": cursor, "registered": 0, "moved": 0, "quit": 0})
                cursor += step
        elif filled and granularity == "month":
            cursor = _next_month(filled[-1]["period"])
            while cursor < point["period"]:
                filled.append({"period": cursor, "registered": 0, "moved": 0, "quit": 0})
                cursor = _next_month(cursor)
        filled.append(point)
    return [{**point, "period": point["period"].isoformat()} for point in filled]


def _next_month(day: date) -> date:
    return date(day.year + day.month // 12, day.month % 12 + 1, 1)
