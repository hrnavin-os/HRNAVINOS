"""Business logic for the induction Attendance board.

The board is a view of the induction roll, not a list of its own: everyone who
came through an induction call is on it, and each of its four tabs is one
yes/no marker against that roll. A parallel collection of "attendance students"
would be a second copy of the same people, and the two would diverge the first
time somebody was renamed on one of them.

Everything tab-specific lives in MARKERS below. Adding a fifth tab is an entry
there - a stored field, how to read it, how to write it, and how to ask the
database for one side of it - rather than a fifth branch in each of the four
functions underneath.
"""
import uuid
from dataclasses import dataclass
from typing import Callable

from app.database.base import utcnow
from app.exceptions.base import BadRequestError, NotFoundError
from app.models.induction_entry import AttendanceMark, InductionEntry
from app.models.terms_document import TermsDocument
from app.repositories.induction_entry_repository import InductionEntryRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.attendance_board_schema import (
    AttendanceStatsResponse,
    AttendanceStudentResponse,
    MarkerState,
    MarkerStatsResponse,
    MarkResponse,
    TermsDocumentResponse,
    TermsDocumentUpdate,
)
from app.services.audit_service import AuditService
from app.services.induction_entry_service import InductionEntryService, batch_for, stamp_terms_signature


@dataclass(frozen=True)
class Marker:
    """One tab: how its yes/no is stored, read, written and queried.

    `read` returns (marked, source, at, by_name) for one entry. `write` sets it
    - taking None to mean "clear the manual answer", which on an automatic
    marker returns the student to whatever the data says. `query` turns a
    wanted side into the Mongo filter that selects it, so the tab counts and
    the tab's rows are answered by the database rather than by loading the roll
    into Python.
    """

    key: str
    label: str
    read: Callable[[InductionEntry], MarkResponse]
    write: Callable[[InductionEntry, bool | None, uuid.UUID | None, str | None], None]
    query: Callable[[bool], dict]


def _plain_mark(entry: InductionEntry, attribute: str) -> MarkResponse:
    mark: AttendanceMark = getattr(entry.attendance, attribute)
    return MarkResponse(
        marked=bool(mark.marked),
        source="manual" if mark.marked is not None else "none",
        at=mark.at,
        by_name=mark.by_name,
    )


def _write_plain(
    entry: InductionEntry,
    attribute: str,
    value: bool | None,
    actor_id: uuid.UUID | None,
    actor_name: str | None,
) -> None:
    # Clearing wipes the attribution with it: the stamp says who vouches for
    # the answer that stands, and a cleared marker has no answer to vouch for.
    setattr(
        entry.attendance,
        attribute,
        AttendanceMark(
            marked=value,
            at=utcnow() if value is not None else None,
            by=actor_id if value is not None else None,
            by_name=actor_name if value is not None else None,
        ),
    )


def _plain_query(attribute: str, wanted: bool) -> dict:
    """Yes is the explicit True; no is everything else - False, null, and the
    entries created before the field existed, where the key is absent
    altogether. `$ne: True` is what makes a missing key count as no, which it
    must: a student nobody has marked has certainly not attended."""
    path = f"attendance.{attribute}.marked"
    return {path: True} if wanted else {path: {"$ne": True}}


def _terms_mark(entry: InductionEntry) -> MarkResponse:
    details = entry.other_details
    return MarkResponse(
        marked=bool(details.terms_form_signed),
        source="manual" if details.terms_form_signed is not None else "none",
        at=details.terms_signed_at,
        by_name=details.terms_signed_by_name,
    )


def _write_terms(
    entry: InductionEntry, value: bool | None, actor_id: uuid.UUID | None, actor_name: str | None
) -> None:
    # Writes the field the induction update form's fourth page has always
    # written, rather than a copy of it: the board is a second way into one
    # fact, not a second fact.
    entry.other_details.terms_form_signed = value
    stamp_terms_signature(entry.other_details, signed=value, actor_id=actor_id, actor_name=actor_name)


def _terms_query(wanted: bool) -> dict:
    path = "other_details.terms_form_signed"
    return {path: True} if wanted else {path: {"$ne": True}}


def _foundation_mark(entry: InductionEntry) -> MarkResponse:
    """Attended the foundation class.

    Answered by the data unless somebody has said otherwise: an entry linked to
    a Foundation Form submission got there through the foundation class, and
    that link is already made automatically on mobile-number match. So the
    common case needs no ticking at all, and a manual mark exists only to
    correct it.
    """
    mark = entry.attendance.foundation_class_attended
    if mark.marked is not None:
        return MarkResponse(marked=mark.marked, source="manual", at=mark.at, by_name=mark.by_name)
    linked = entry.foundation_lead_id is not None
    return MarkResponse(marked=linked, source="auto" if linked else "none", at=entry.converted_at)


def _foundation_query(wanted: bool) -> dict:
    path = "attendance.foundation_class_attended.marked"
    if wanted:
        # A manual yes, or no manual answer and a Foundation link to infer one
        # from. `$eq: None` also matches entries where the key is absent.
        return {"$or": [{path: True}, {path: {"$eq": None}, "foundation_lead_id": {"$ne": None}}]}
    return {"$or": [{path: False}, {path: {"$eq": None}, "foundation_lead_id": {"$eq": None}}]}


MARKERS: dict[str, Marker] = {
    "terms": Marker(
        key="terms",
        label="Terms & Condition",
        read=_terms_mark,
        write=_write_terms,
        query=_terms_query,
    ),
    "polls": Marker(
        key="polls",
        label="Polls",
        read=lambda entry: _plain_mark(entry, "polls_selected"),
        write=lambda entry, value, actor_id, actor_name: _write_plain(
            entry, "polls_selected", value, actor_id, actor_name
        ),
        query=lambda wanted: _plain_query("polls_selected", wanted),
    ),
    "success_meet": Marker(
        key="success_meet",
        label="Success Meet",
        read=lambda entry: _plain_mark(entry, "success_meet_attended"),
        write=lambda entry, value, actor_id, actor_name: _write_plain(
            entry, "success_meet_attended", value, actor_id, actor_name
        ),
        query=lambda wanted: _plain_query("success_meet_attended", wanted),
    ),
    "foundation_class": Marker(
        key="foundation_class",
        label="Foundation Class",
        read=_foundation_mark,
        write=lambda entry, value, actor_id, actor_name: _write_plain(
            entry, "foundation_class_attended", value, actor_id, actor_name
        ),
        query=_foundation_query,
    ),
}

# What the search box looks in. The board is worked by name and number -
# somebody rings in saying they have sent the signed form - so those come
# first, with email for the cases where that is what was quoted.
SEARCH_FIELDS = ["name", "phone", "email"]


class AttendanceBoardService:
    def __init__(self) -> None:
        self.entries = InductionEntryRepository()
        self.users = UserRepository()
        self.induction = InductionEntryService()
        self.audit = AuditService()

    # ---------- The terms document ----------

    async def get_document(self) -> TermsDocument:
        """The one terms document, created empty on first read.

        Created rather than 404'd so the tab has something to render before
        anybody has written the terms, and so the first save is an edit like
        every later one instead of a special case.
        """
        document = await TermsDocument.find_one({})
        if document:
            return document
        document = TermsDocument()
        await document.insert()
        return document

    async def document_response(self, document: TermsDocument) -> TermsDocumentResponse:
        editor = await self.users.get_by_id(document.updated_by) if document.updated_by else None
        return TermsDocumentResponse(
            title=document.title,
            body=document.body,
            updated_at=document.updated_at,
            updated_by_name=f"{editor.first_name} {editor.last_name}".strip() if editor else None,
        )

    async def update_document(self, data: TermsDocumentUpdate, *, actor_id: uuid.UUID | None) -> TermsDocument:
        document = await self.get_document()
        changes = data.model_dump(exclude_unset=True)
        for field, value in changes.items():
            if value is not None:
                setattr(document, field, value)
        document.updated_by = actor_id
        document.touch(actor_id)
        await document.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="TermsDocument",
            entity_id=str(document.id),
            changes={"fields": list(changes)},
        )
        return document

    # ---------- The roll ----------

    @staticmethod
    def marker(key: str) -> Marker:
        found = MARKERS.get(key)
        if not found:
            raise BadRequestError(f"Unknown attendance marker '{key}'.")
        return found

    @staticmethod
    def to_response(entry: InductionEntry) -> AttendanceStudentResponse:
        return AttendanceStudentResponse(
            id=entry.id,
            name=entry.name,
            phone=entry.phone,
            email=entry.email,
            section=entry.section,
            batch=batch_for(entry.registration_date),
            registration_date=entry.registration_date,
            status=entry.status.value,
            marks={key: marker.read(entry) for key, marker in MARKERS.items()},
        )

    def _query(
        self, *, marker_key: str, state: MarkerState, section: str | None, batch: str | None = None
    ) -> dict:
        """The stored-field query for one tab, narrowed to a section if the
        caller is pinned to one.

        Note what is *not* here: the induction board's status tabs. This board
        covers everyone who came through induction, whether they are still in
        it, have moved to Foundation or have quit - all of them were asked to
        sign and to turn up, and hiding the ones who moved on is how a missing
        signature goes unnoticed.

        The marker's own filter is wrapped in `$and` because two of them use
        `$or` at the top level, and the repository's search puts its own `$or`
        on the query - one would silently replace the other.
        """
        query: dict = {}
        if state != "all":
            query["$and"] = [self.marker(marker_key).query(state == "yes")]
        if section:
            query["section"] = section
        # Batch isn't stored - it's derived from registration_date (see
        # InductionEntryService.batch_for) - so filtering by it is a range over
        # the month it stands for. An unparseable batch narrows nothing rather
        # than erroring: a junk query param should return the roll, not a 500.
        window = InductionEntryService.batch_date_range(batch) if batch else None
        if window:
            query["registration_date"] = {"$gte": window[0], "$lte": window[1]}
        return query

    async def list_students(
        self,
        params: PaginationParams,
        *,
        marker_key: str = "terms",
        state: MarkerState = "all",
        section: str | None = None,
        batch: str | None = None,
    ) -> PaginatedResponse[AttendanceStudentResponse]:
        items, total = await self.entries.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=SEARCH_FIELDS,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=self._query(marker_key=marker_key, state=state, section=section, batch=batch),
        )
        return PaginatedResponse[AttendanceStudentResponse].build(
            [self.to_response(entry) for entry in items], total, params.page, params.page_size
        )

    async def stats(
        self, *, section: str | None = None, batch: str | None = None
    ) -> AttendanceStatsResponse:
        """Every tab's split, in one response.

        Counted rather than derived from the current page - a tab has to say
        how much is behind it without being opened - and `no` is subtracted
        from the total rather than counted separately, so the two can never
        fail to add up to it.

        Counts the *filtered* roll, not the whole one: a section filter that
        left the tab counts describing everybody would have the header
        disagreeing with the table under it.
        """
        base = {
            "is_deleted": False,
            **self._query(marker_key="terms", state="all", section=section, batch=batch),
        }
        total = await InductionEntry.find(base).count()

        markers = {}
        for key, marker in MARKERS.items():
            yes = await InductionEntry.find({**base, "$and": [marker.query(True)]}).count()
            markers[key] = MarkerStatsResponse(total=total, yes=yes, no=total - yes)
        return AttendanceStatsResponse(total=total, markers=markers)

    async def filter_options(self, *, section: str | None = None) -> dict:
        """The sections and batches actually present on the roll.

        Read from the entries rather than from the form config, for the same
        reason the induction board's own options are: a filter offering a value
        that matches nothing - or missing one that matches rows - is worse than
        no filter at all. Batches are derived per entry, newest first.
        """
        query: dict = {"is_deleted": False}
        if section:
            query["section"] = section
        entries = await InductionEntry.find(query).to_list()

        sections = sorted({entry.section for entry in entries if entry.section})
        batches = sorted(
            {batch_for(entry.registration_date) for entry in entries},
            # "Batch-9" before "Batch-10" needs a numeric sort, not a string one.
            key=lambda value: int(value.split("-")[1]),
            reverse=True,
        )
        return {"sections": sections, "batches": batches}

    async def set_mark(
        self, entry_id: uuid.UUID, marker_key: str, *, marked: bool | None, actor_id: uuid.UUID | None
    ) -> InductionEntry:
        """Moves one student across one marker.

        `marked=None` clears the manual answer rather than setting "no" - on
        the foundation class that hands the row back to what the Foundation
        link says, which is the only way to undo a correction.
        """
        marker = self.marker(marker_key)
        entry = await self.entries.get_by_id(entry_id)
        if not entry or entry.is_deleted:
            raise NotFoundError("That student is no longer on the induction list.")

        marker.write(entry, marked, actor_id, await self.induction.actor_name(actor_id))
        entry.updated_by = actor_id
        entry.touch(actor_id)
        await entry.save()
        await self.audit.record(
            user_id=actor_id,
            action="ATTENDANCE_MARK",
            entity_type="InductionEntry",
            entity_id=str(entry.id),
            changes={"marker": marker_key, "marked": marked},
        )
        return entry
