"""Business logic for the Terms & Conditions register.

The register is a view of the induction roll, not a list of its own: everyone
who came through an induction call is on it, and "signed" is a fact stored on
their induction entry (other_details.terms_form_signed, which the update form's
fourth page has always written). A parallel collection of "terms students"
would be a second copy of the same people, and the two would diverge the first
time somebody was renamed on one of them.
"""
import uuid

from app.database.base import utcnow
from app.exceptions.base import NotFoundError
from app.models.induction_entry import InductionEntry
from app.models.terms_document import TermsDocument
from app.repositories.induction_entry_repository import InductionEntryRepository
from app.repositories.user_repository import UserRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.terms_schema import (
    TermsDocumentResponse,
    TermsDocumentUpdate,
    TermsFilter,
    TermsStatsResponse,
    TermsStudentResponse,
)
from app.services.audit_service import AuditService
from app.services.induction_entry_service import InductionEntryService, batch_for, stamp_terms_signature

# The stored shape of each tab. Signed is the explicit True; not-signed is
# everything else - False, null, and the entries created before the field
# existed, where the key is absent altogether. Written as `$ne: True` rather
# than `$in: [False, None]` so a missing key counts, which it must: an entry
# nobody has answered the question for has certainly not signed.
_SIGNED = {"other_details.terms_form_signed": True}
_NOT_SIGNED = {"other_details.terms_form_signed": {"$ne": True}}

FILTER_QUERIES: dict[str, dict] = {"all": {}, "signed": _SIGNED, "not_signed": _NOT_SIGNED}

# What the search box looks in. The register is worked by name and number -
# somebody rings in saying they have sent the signed form - so those two come
# first, with email for the cases where that is what was quoted.
SEARCH_FIELDS = ["name", "phone", "email"]


class TermsService:
    def __init__(self) -> None:
        self.entries = InductionEntryRepository()
        self.users = UserRepository()
        self.induction = InductionEntryService()
        self.audit = AuditService()

    # ---------- The document ----------

    async def get_document(self) -> TermsDocument:
        """The one terms document, created empty on first read.

        Created rather than 404'd so the page has something to render before
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

    # ---------- The register ----------

    @staticmethod
    def to_response(entry: InductionEntry) -> TermsStudentResponse:
        details = entry.other_details
        return TermsStudentResponse(
            id=entry.id,
            name=entry.name,
            phone=entry.phone,
            email=entry.email,
            section=entry.section,
            batch=batch_for(entry.registration_date),
            registration_date=entry.registration_date,
            status=entry.status.value,
            signed=bool(details.terms_form_signed),
            signed_at=details.terms_signed_at,
            signed_by_name=details.terms_signed_by_name,
        )

    def _query(self, *, terms_filter: TermsFilter, section: str | None) -> dict:
        """The stored-field query for one tab, narrowed to a section if the
        caller is pinned to one.

        Note what is *not* here: the induction board's status tabs. The
        register covers everyone who came through induction, whether they are
        still in it, have moved to Foundation or have quit - a signature is
        owed by all of them, and hiding the ones who moved on is how a signed
        form goes missing.
        """
        query = dict(FILTER_QUERIES.get(terms_filter, {}))
        if section:
            query["section"] = section
        return query

    async def list_students(
        self,
        params: PaginationParams,
        *,
        terms_filter: TermsFilter = "all",
        section: str | None = None,
    ) -> PaginatedResponse[TermsStudentResponse]:
        items, total = await self.entries.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=SEARCH_FIELDS,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=self._query(terms_filter=terms_filter, section=section),
        )
        return PaginatedResponse[TermsStudentResponse].build(
            [self.to_response(entry) for entry in items], total, params.page, params.page_size
        )

    async def stats(self, *, section: str | None = None) -> TermsStatsResponse:
        """The number behind each tab.

        Counted rather than derived from the current page - the tabs have to
        say how much is behind them without opening them - and signed is
        subtracted from the total rather than counted separately, so the two
        can never fail to add up to it.
        """
        base = self._query(terms_filter="all", section=section)
        total = await InductionEntry.find({"is_deleted": False, **base}).count()
        signed = await InductionEntry.find({"is_deleted": False, **base, **_SIGNED}).count()
        return TermsStatsResponse(total=total, signed=signed, not_signed=total - signed)

    async def set_signed(
        self, entry_id: uuid.UUID, *, signed: bool, actor_id: uuid.UUID | None
    ) -> InductionEntry:
        """Moves one student between the signed and not-signed tabs.

        Writes the same field the induction update form writes, so a signature
        recorded here shows up there and vice versa - the register is a second
        way into one fact, not a second fact.
        """
        entry = await self.entries.get_by_id(entry_id)
        if not entry or entry.is_deleted:
            raise NotFoundError("That student is no longer on the induction list.")

        entry.other_details.terms_form_signed = signed
        stamp_terms_signature(
            entry.other_details,
            signed=signed,
            actor_id=actor_id,
            actor_name=await self.induction.actor_name(actor_id),
        )
        entry.updated_by = actor_id
        entry.touch(actor_id)
        await entry.save()
        await self.audit.record(
            user_id=actor_id,
            action="TERMS_SIGNED" if signed else "TERMS_UNSIGNED",
            entity_type="InductionEntry",
            entity_id=str(entry.id),
            changes={"terms_form_signed": signed, "at": utcnow().isoformat()},
        )
        return entry
