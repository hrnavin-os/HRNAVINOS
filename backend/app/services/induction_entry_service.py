"""Business logic for the Induction Call Form."""
import uuid
from datetime import date, datetime, time, timedelta

from app.exceptions.base import BadRequestError, NotFoundError
from app.models.enums import InductionStatus
from app.models.lead import Lead
from app.models.induction_entry import (
    InductionEntry,
    InductionOtherDetails,
    InductionPlacement,
    InductionQualification,
    InductionRemarks,
)
from app.models.user import User
from app.repositories.induction_entry_repository import InductionEntryRepository, status_query
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.induction_entry_schema import (
    InductionDetailsUpdate,
    InductionEntryCreate,
    InductionEntryResponse,
    InductionEntryUpdate,
)
from app.services.audit_service import AuditService
from app.utils.phone import normalize_phone

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

    async def to_response(
        self, entry: InductionEntry, *, foundation_status: str | None = None
    ) -> InductionEntryResponse:
        # model_dump() also carries the BaseDocument fields (is_deleted,
        # created_by, revision_id...); the response schema ignores what it
        # doesn't declare, so they're harmless here.
        assignee = await self.users.get_by_id(entry.assigned_to) if entry.assigned_to else None
        return InductionEntryResponse(
            **entry.model_dump(),
            batch=batch_for(entry.registration_date),
            status=entry.status,
            foundation_status=foundation_status,
            assigned_to_name=f"{assignee.first_name} {assignee.last_name}".strip() if assignee else None,
        )

    async def foundation_statuses(self, entries: list[InductionEntry]) -> dict:
        """{entry id: the linked lead's pipeline stage}, for the Moved tab.

        One query for the page rather than one per row - the ids are collected
        first and fetched together. Entries with no link aren't in the result,
        which is every row of the other tab.
        """
        lead_ids = [entry.foundation_lead_id for entry in entries if entry.foundation_lead_id]
        if not lead_ids:
            return {}
        leads = await Lead.find({"_id": {"$in": lead_ids}}).to_list()
        stage_by_lead = {lead.id: lead.status.value for lead in leads}
        return {
            entry.id: stage_by_lead[entry.foundation_lead_id]
            for entry in entries
            if entry.foundation_lead_id in stage_by_lead
        }

    async def create(self, data: InductionEntryCreate, *, actor_id: uuid.UUID | None) -> InductionEntry:
        # Assignment happens here rather than being a field on the form: the
        # team keying these in from WhatsApp shouldn't have to remember whose
        # turn it is, and shouldn't be able to skew the rota by choosing.
        assignee, section = await self._next_assignee()
        entry = InductionEntry(
            **data.model_dump(),
            # The key the Foundation Form will match this person on later,
            # computed on write so the match is an indexed lookup.
            phone_normalized=normalize_phone(data.phone),
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

    async def list(
        self,
        params: PaginationParams,
        *,
        filters: dict | None = None,
        status: InductionStatus = InductionStatus.PENDING_INDUCTION,
    ) -> PaginatedResponse:
        """One tab of the Induction board.

        The status is applied here rather than by the caller, so every route
        onto this board inherits the rule that an entry belongs to exactly one
        tab - it can't be listed as both still in Induction and already moved.
        A moved entry is never deleted; it has left the queue and is reachable
        through the lead it became.
        """
        items, total = await self.entries.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "phone", "email", "sales_person", "lead_source", "category"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={**(filters or {}), **status_query(status)},
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    @staticmethod
    def batch_date_range(batch: str) -> tuple[date, date] | None:
        """Turns 'Batch-29' back into the month it covers.

        Batch isn't stored - it's derived from registration_date - so filtering
        by it means filtering on the date range that produces it. Returns None
        for anything unparseable so a junk query param yields no filter rather
        than a 500.
        """
        try:
            number = int(batch.split("-", 1)[1])
        except (IndexError, ValueError):
            return None
        anchor_year, anchor_month = BATCH_ANCHOR
        months = number - BATCH_ANCHOR_NUMBER
        # Shift to a 0-based month index so the year rolls over correctly in
        # both directions, then back to 1-based.
        index = (anchor_year * 12 + (anchor_month - 1)) + months
        year, month = divmod(index, 12)
        month += 1
        start = date(year, month, 1)
        end = date(year + (month == 12), 1 if month == 12 else month + 1, 1) - timedelta(days=1)
        return start, end

    async def filter_options(
        self, *, section: str | None = None, status: InductionStatus = InductionStatus.PENDING_INDUCTION
    ) -> dict:
        """Distinct values actually present in the data, for the filter row.

        Deliberately read from the entries rather than the form config: the
        dropdowns accept typed values that aren't on the configured list, and
        a filter offering an option that matches nothing (or omitting one that
        matches rows) would be worse than useless. Batches are derived per
        entry and returned newest-first.
        """
        entries = await self.entries.list_all_for_options(section=section, status=status)
        distinct = {field: set() for field in ("sales_person", "lead_source", "payment_mode", "category")}
        batches: set[str] = set()
        assignees: dict[str, str] = {}

        for entry in entries:
            for field in distinct:
                value = getattr(entry, field)
                if value:
                    distinct[field].add(value)
            batches.add(batch_for(entry.registration_date))
            if entry.assigned_to:
                assignees[str(entry.assigned_to)] = ""

        for user_id in assignees:
            user = await self.users.get_by_id(uuid.UUID(user_id))
            assignees[user_id] = f"{user.first_name} {user.last_name}".strip() if user else "Unknown"

        return {
            **{field: sorted(values) for field, values in distinct.items()},
            # "Batch-9" before "Batch-10" needs a numeric sort, not a string one.
            "batch": sorted(batches, key=lambda b: int(b.split("-")[1]), reverse=True),
            "assigned_to": [{"value": key, "label": label} for key, label in sorted(assignees.items(), key=lambda kv: kv[1])],
        }

    async def stats(
        self, *, section: str | None = None, status: InductionStatus = InductionStatus.PENDING_INDUCTION
    ) -> dict:
        """Totals behind the board's stat cards - one per section, plus the
        overall count.

        Scoped when the caller is pinned to a section, so a Section Admin's
        "All Entries" card counts their own section rather than every entry in
        the system. Unscoped, `total` is every entry rather than the sum of the
        sections, so anything that arrived while no Section Admin existed (and
        is therefore unassigned) is still counted somewhere.
        """
        by_section = await self.entries.count_by_section_all(status)
        by_status = await self.entries.count_by_status()
        if section:
            scoped = by_section.get(section, 0)
            return {"total": scoped, "by_section": {section: scoped}, "by_status": by_status}
        return {
            "total": await self.entries.count_all(status),
            "by_section": by_section,
            "by_status": by_status,
        }

    # The two dimensions the analytics dashboard breaks entries down by. A
    # closed map rather than interpolating the query param into the pipeline,
    # so no caller can group by an arbitrary field.
    # A closed map, not a field name taken from the caller: the dimension is
    # interpolated straight into a $group _id, so anything reachable from the
    # query string would be a way to read fields this endpoint never intended to
    # expose. Adding a dimension means adding it here on purpose.
    _ANALYTICS_FIELDS = {
        "category": "$category",
        "call_remark": "$call_remark",
        "sales_person": "$sales_person",
        "lead_source": "$lead_source",
    }

    async def analytics(
        self,
        dimension: str,
        *,
        section: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict:
        """Counts per distinct value of one field, with how many of each went on
        to Foundation and how many quit.

        Aggregated in the database rather than by loading every entry: the
        board is meant to keep working at a few thousand rows, and the counts
        are the whole payload.

        Each row carries moved and quit as well as the total, because the
        interesting question isn't how many Freshers there were - it's how many
        of them converted and how many walked. A bare count answers neither.

        The window and the section are the dashboard's filter rail. Applied
        here, inside the one $match every view on the canvas is built on, so
        two panels on the same screen cannot end up counting different people.
        """
        field = self._ANALYTICS_FIELDS.get(dimension)
        if field is None:
            raise BadRequestError(f"Unknown analytics dimension '{dimension}'.")

        match: dict = {"is_deleted": False}
        if section:
            match["section"] = section
        # Registration dates are stored as midnight datetimes, and a pipeline
        # stage isn't passed through the ODM's encoder the way a find() query
        # is - so the bounds are converted here rather than left as dates.
        # Midnight on date_to still takes in that whole day, because every
        # stored value is midnight.
        window: dict = {}
        if date_from:
            window["$gte"] = datetime.combine(date_from, time.min)
        if date_to:
            window["$lte"] = datetime.combine(date_to, time.min)
        if window:
            match["registration_date"] = window

        # Same "quit" rule the buckets use - matched on the word rather than a
        # list of options, so this can't drift from them.
        quit_match = {
            "$regexMatch": {"input": {"$ifNull": ["$call_remark", ""]}, "regex": "quit", "options": "i"}
        }
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": field,
                        "count": {"$sum": 1},
                        "moved": {"$sum": {"$cond": [{"$ifNull": ["$foundation_lead_id", False]}, 1, 0]}},
                        "quit": {"$sum": {"$cond": [quit_match, 1, 0]}},
                    }
                },
                {"$sort": {"count": -1}},
            ]
        ).to_list()

        current, comparison = await self._period_comparison(section, date_from, date_to)

        return {
            "dimension": dimension,
            "total": sum(row["count"] for row in rows),
            "current": current,
            "comparison": comparison,
            "items": [
                {
                    # Entries that were never given a value are a real finding -
                    # "how much of the data is missing" is the first thing an
                    # analytics view should be honest about - so they're a named
                    # row rather than dropped.
                    "value": row["_id"] or "Not set",
                    "count": row["count"],
                    "moved": row["moved"],
                    "quit": row["quit"],
                }
                for row in rows
            ],
        }

    async def _period_comparison(
        self, section: str | None, date_from: date | None, date_to: date | None
    ) -> tuple[dict, dict] | tuple[None, None]:
        """This period's three headline figures and the previous period's.

        "Previous" means the window of the same length ending the day before
        this one starts, so a fortnight is compared against the fortnight
        before it rather than against a fixed month.

        With no window set the board totals everything, and there is no period
        before all time - so the trend is measured over the last thirty days
        against the thirty before, and the label says so rather than letting a
        reader take the arrow for a movement in the headline number.
        """
        today = date.today()
        if date_from and date_to:
            span = (date_to - date_from).days + 1
            current = (date_from, date_to)
            label = f"vs previous {span} days"
        elif date_from or date_to:
            # One open end has no length, so there is nothing to step back by.
            return None, None
        else:
            span = 30
            current = (today - timedelta(days=29), today)
            label = "last 30 days vs the 30 before"
        earlier = (current[0] - timedelta(days=span), current[0] - timedelta(days=1))

        return (
            {"label": label, **await self._headline(section, *current)},
            {"label": label, **await self._headline(section, *earlier)},
        )

    async def _headline(self, section: str | None, start: date, end: date) -> dict:
        """How many registered in a window, how many of them moved, how many
        quit. The same three numbers the stat tiles lead with."""
        match: dict = {
            "is_deleted": False,
            "registration_date": {
                "$gte": datetime.combine(start, time.min),
                "$lte": datetime.combine(end, time.min),
            },
        }
        if section:
            match["section"] = section
        quit_match = {
            "$regexMatch": {"input": {"$ifNull": ["$call_remark", ""]}, "regex": "quit", "options": "i"}
        }
        rows = await InductionEntry.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": 1},
                        "moved": {"$sum": {"$cond": [{"$ifNull": ["$foundation_lead_id", False]}, 1, 0]}},
                        "quit": {"$sum": {"$cond": [quit_match, 1, 0]}},
                    }
                },
            ]
        ).to_list()
        row = rows[0] if rows else {}
        return {key: row.get(key, 0) for key in ("total", "moved", "quit")}

    async def update(
        self, entry_id: uuid.UUID, data: InductionEntryUpdate, *, actor_id: uuid.UUID | None
    ) -> InductionEntry:
        entry = await self.get(entry_id)
        update_data = data.model_dump(exclude_unset=True)
        # Correcting a mistyped number has to move the match key with it, or
        # the entry would keep matching on the number it no longer has.
        if update_data.get("phone"):
            update_data["phone_normalized"] = normalize_phone(update_data["phone"])
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

    async def update_details(
        self, entry_id: uuid.UUID, data: InductionDetailsUpdate, *, actor_id: uuid.UUID | None
    ) -> InductionEntry:
        """Saves the post-call form. Pages arrive one at a time as the user
        moves through it, so an absent page leaves what's already stored alone
        rather than blanking it - `exclude_unset` on each group means clearing
        a single answer still works, but skipping a page doesn't wipe it."""
        entry = await self.get(entry_id)
        groups = {
            "qualification": InductionQualification,
            "placement": InductionPlacement,
            "remarks": InductionRemarks,
            "other_details": InductionOtherDetails,
        }
        changed = []
        for name, model in groups.items():
            page = getattr(data, name)
            if page is None:
                continue
            merged = getattr(entry, name).model_dump()
            merged.update(page.model_dump(exclude_unset=True))
            setattr(entry, name, model(**merged))
            changed.append(name)

        entry.updated_by = actor_id
        entry.touch(actor_id)
        await entry.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="InductionEntry",
            entity_id=str(entry.id),
            changes={"details": changed},
        )
        return entry

    async def delete(self, entry_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        entry = await self.get(entry_id)
        await self.entries.delete(entry)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="InductionEntry", entity_id=str(entry.id)
        )
