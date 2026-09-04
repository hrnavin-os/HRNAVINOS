"""Business logic for the Batch Confirmation module (HR Coordinator).

Owns the hand-off from CRM to classroom. A lead that reaches the
`batch_confirmation` stage is given a provisional seat in a Batch
(BatchAllocation); once the whole batch passes every readiness gate, the
coordinator confirms it and each seat becomes a real Student + Admission.

Nothing downstream is created until confirmation, so a roster can be
assembled and rearranged freely without leaving orphaned Student rows behind
if the batch never runs.
"""
import uuid
from datetime import date

from app.database.base import utcnow
from app.exceptions.base import BadRequestError, ConflictError, NotFoundError, ValidationAppError
from app.models.admission import Admission
from app.models.batch import Batch
from app.models.batch_allocation import BatchAllocation
from app.models.enums import (
    AdmissionStatus,
    AllocationStatus,
    BatchStatus,
    LeadStatus,
    StudentStatus,
    TutorStatus,
    WhatsAppGroupStatus,
)
from app.models.induction_entry import InductionEntry
from app.models.lead import INVITE_WAIT, Lead
from app.models.student import Student
from app.repositories.admission_repository import AdmissionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.batch_allocation_repository import BatchAllocationRepository
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.student_repository import StudentRepository
from app.repositories.tutor_repository import TutorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.batch_confirmation_schema import (
    AllocatedLeadResponse,
    AllocationRowResponse,
    BatchFormOptionsResponse,
    BatchReadinessDetailResponse,
    BatchReadinessResponse,
    ConfirmBatchResponse,
    CoordinatorSummaryResponse,
    OptionItem,
    PendingLeadResponse,
    ReadinessCheck,
)
from app.schemas.batch_schema import BatchCreate
from app.services.audit_service import AuditService
from app.services.batch_service import BatchService
from app.services.foundation_form_config_service import FoundationFormConfigService
from app.services.induction_entry_service import batch_for
from app.utils.foundation_groups import foundation_group_for
from app.services.whatsapp_service import WhatsAppService

# Smallest roster the institute will run a batch with. Deliberately a single
# constant rather than per-course config: the rule is operational, not
# academic, and moving it later is a one-line change plus a seed migration if
# it ever needs to vary per course.
MINIMUM_ALLOCATIONS = 5

# Batches a coordinator is still working on. COMPLETED/CANCELLED/ONGOING ones
# are out of scope for this dashboard.
COORDINATOR_BATCH_STATUSES = [BatchStatus.UPCOMING, BatchStatus.CONFIRMED]


def _is_fully_paid(lead: Lead) -> tuple[bool, int, int]:
    """(fully_paid, paid_installments, total_installments) for a lead.

    Foundation Form leads carry an installment plan; everything else only ever
    has a single `paid_amount`. A lead with neither counts as unpaid - nothing
    has been collected yet.
    """
    if lead.installments:
        paid = sum(1 for installment in lead.installments if installment.paid)
        return paid == len(lead.installments), paid, len(lead.installments)
    if lead.paid_amount is not None and lead.paid_amount > 0:
        return True, 1, 1
    return False, 0, 0


def _split_name(full_name: str) -> tuple[str, str]:
    """Lead carries one `name`; Student wants first/last separately."""
    parts = full_name.strip().split(maxsplit=1)
    if not parts:
        return "Unknown", ""
    return parts[0], parts[1] if len(parts) > 1 else ""


class BatchConfirmationService:
    def __init__(self) -> None:
        self.allocations = BatchAllocationRepository()
        self.batches = BatchRepository()
        self.leads = LeadRepository()
        self.courses = CourseRepository()
        self.tutors = TutorRepository()
        self.users = UserRepository()
        self.students = StudentRepository()
        self.admissions = AdmissionRepository()
        self.audit = AuditService()
        self.audit_logs = AuditLogRepository()
        self.whatsapp = WhatsAppService()

    # ---------- Reads ----------

    async def list_pending_leads(self) -> list[PendingLeadResponse]:
        """Leads parked at the Batch Confirmation stage without a live seat."""
        taken = await self.allocations.allocated_lead_ids()
        leads = await Lead.find(
            {"is_deleted": False, "reviewed": {"$ne": False}, "status": LeadStatus.BATCH_CONFIRMATION}
        ).sort("+created_at").to_list()

        pending = []
        for lead in leads:
            if lead.id in taken:
                continue
            fully_paid, paid, total = _is_fully_paid(lead)
            pending.append(
                PendingLeadResponse(
                    id=lead.id,
                    name=lead.name,
                    email=lead.email,
                    phone=lead.phone,
                    course_interest=lead.course_interest,
                    batch_preference=lead.batch_preference,
                    section=lead.section,
                    fully_paid=fully_paid,
                    paid_installments=paid,
                    total_installments=total,
                    hr_marked=lead.hr_marked,
                    foundation_group=foundation_group_for(lead.created_at),
                    created_at=lead.created_at,
                )
            )
        return pending

    async def list_allocations(self, *, status: AllocationStatus | None = None) -> list[AllocationRowResponse]:
        """Every seat across all batches, optionally narrowed to one status."""
        query: dict = {"is_deleted": False}
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": [AllocationStatus.ALLOCATED, AllocationStatus.CONFIRMED]}

        allocations = await BatchAllocation.find(query).sort("-created_at").to_list()

        rows = []
        for allocation in allocations:
            lead = await self.leads.get_by_id(allocation.lead_id)
            batch = await self.batches.get_by_id(allocation.batch_id)
            if not lead or not batch:
                continue
            rows.append(
                AllocationRowResponse(
                    allocation_id=allocation.id,
                    lead_id=lead.id,
                    name=lead.name,
                    email=lead.email,
                    phone=lead.phone,
                    course_interest=lead.course_interest,
                    batch_id=batch.id,
                    batch_name=batch.name,
                    status=allocation.status,
                    fully_paid=_is_fully_paid(lead)[0],
                    student_id=allocation.student_id,
                    allocated_at=allocation.created_at,
                    confirmed_at=allocation.confirmed_at,
                )
            )
        return rows

    async def mark_lead(self, lead_id: uuid.UUID, *, marked: bool, actor_id: uuid.UUID | None) -> Lead:
        """Ticks the coordinator's own working marker on a queued lead."""
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")

        await self.leads.update(
            lead,
            {"hr_marked": marked, "hr_marked_at": utcnow() if marked else None, "updated_by": actor_id},
        )
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"hr_marked": marked},
        )
        return lead

    # ---------- HR student tabs ----------

    async def list_hr_students(self, tab: str) -> list[Lead]:
        """The four HR Coordinator tabs, each a plain query over Lead.

        `pending_hr` is everything Finance has approved but not yet released
        to the batch stage; `approved` is at the batch stage and still waiting
        on a WhatsApp group; assigning that group is what moves a lead into
        `group_assigned`, which is why it filters on the timestamp rather than
        on stage.

        `group_assigned` excludes Lost. Losing a student doesn't clear the
        timestamp - they were in the group, that happened - but a lost student
        listed as an active group member appeared in two tabs at once and was
        counted twice on the cards above them.
        """
        base: dict = {"is_deleted": False, "reviewed": {"$ne": False}}
        queries = {
            "pending_hr": {**base, "status": LeadStatus.FINANCIAL_APPROVAL},
            "approved": {**base, "status": LeadStatus.BATCH_CONFIRMATION, "group_assigned_at": None},
            "group_assigned": {
                **base,
                "group_assigned_at": {"$ne": None},
                "status": {"$ne": LeadStatus.LOST},
            },
            "lost": {**base, "status": LeadStatus.LOST},
        }
        if tab not in queries:
            raise BadRequestError(f"Unknown tab '{tab}'.")
        return await Lead.find(queries[tab]).sort("+created_at").to_list()

    @staticmethod
    def whatsapp_status_query(status: WhatsAppGroupStatus) -> dict:
        """The stored-field query matching a derived WhatsApp status.

        Mirrors Lead.whatsapp_status. The derivation lives on the model so a
        single lead can report itself; this exists so the database can filter
        thousands without loading them, and the two have to agree - the cutoff
        is computed from the same INVITE_WAIT either way.

        `$eq: None` rather than a bare None throughout, so leads written before
        these fields existed - where the key is absent rather than null - match
        as Not Invited instead of silently vanishing from every filter.
        """
        cutoff = utcnow() - INVITE_WAIT
        if status == WhatsAppGroupStatus.JOINED:
            return {"group_assigned_at": {"$ne": None}}
        if status == WhatsAppGroupStatus.NOT_INVITED:
            return {"group_assigned_at": {"$eq": None}, "whatsapp_invite_sent_at": {"$eq": None}}
        if status == WhatsAppGroupStatus.FOLLOW_UP_REQUIRED:
            return {"group_assigned_at": {"$eq": None}, "whatsapp_invite_sent_at": {"$ne": None, "$lte": cutoff}}
        # INVITE_SENT: invited, still inside the waiting period.
        return {"group_assigned_at": {"$eq": None}, "whatsapp_invite_sent_at": {"$ne": None, "$gt": cutoff}}

    async def list_whatsapp_queue(self, status: WhatsAppGroupStatus | None = None) -> list[Lead]:
        """The group-onboarding board: every candidate at the batch stage, or
        one status of them.

        Joined candidates are included - the coordinator needs to see who is
        already in as well as who isn't, and hiding them would make the counts
        on the filter chips disagree with the list they filter.
        """
        query: dict = {
            "is_deleted": False,
            "reviewed": {"$ne": False},
            "status": LeadStatus.BATCH_CONFIRMATION,
        }
        if status is not None:
            query.update(self.whatsapp_status_query(status))
        return await Lead.find(query).sort("+created_at").to_list()

    async def whatsapp_counts(self) -> dict[str, int]:
        """One count per status, for the filter chips."""
        counts = {}
        for status in WhatsAppGroupStatus:
            counts[status.value] = await Lead.find(
                {
                    "is_deleted": False,
                    "reviewed": {"$ne": False},
                    "status": LeadStatus.BATCH_CONFIRMATION,
                    **self.whatsapp_status_query(status),
                }
            ).count()
        counts["all"] = sum(counts.values())
        return counts

    async def batches_for(self, leads: list[Lead]) -> dict[uuid.UUID, str]:
        """{lead id: batch} for leads linked to an induction entry.

        One query for the whole page rather than one per row: the induction ids
        are collected first and fetched together. Leads with no induction
        record simply aren't in the result, and the caller falls back to
        whatever batch was typed by hand.
        """
        entry_ids = [lead.induction_entry_id for lead in leads if lead.induction_entry_id]
        if not entry_ids:
            return {}

        entries = await InductionEntry.find({"_id": {"$in": entry_ids}}).to_list()
        batch_by_entry = {entry.id: batch_for(entry.registration_date) for entry in entries}
        return {
            lead.id: batch_by_entry[lead.induction_entry_id]
            for lead in leads
            if lead.induction_entry_id in batch_by_entry
        }

    async def set_batch_number(
        self, lead_id: uuid.UUID, *, batch_number: str, actor_id: uuid.UUID | None
    ) -> Lead:
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        value = batch_number.strip() or None
        await self.leads.update(lead, {"batch_number": value, "updated_by": actor_id})
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"batch_number": value},
        )
        return lead

    async def set_group_assigned(
        self, lead_id: uuid.UUID, *, assigned: bool = True, actor_id: uuid.UUID | None
    ) -> Lead:
        """Records that the student joined their section's WhatsApp group,
        which is what moves them from 'Approved by Finance' to 'Group
        Assigned'. Only meaningful once they've reached the batch stage.

        Clearing it (assigned=False) sends them back to 'Approved by Finance'
        - the way to undo an assignment recorded by mistake, and a plain
        timestamp change rather than a stage move.
        """
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        if assigned and lead.status != LeadStatus.BATCH_CONFIRMATION:
            raise BadRequestError("Only leads at the Batch Confirmation stage can be marked group-assigned.")

        assigned_at = utcnow() if assigned else None
        await self.leads.update(lead, {"group_assigned_at": assigned_at, "updated_by": actor_id})
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"group_assigned_at": assigned_at.isoformat() if assigned_at else None},
        )
        return lead

    # ---------- WhatsApp group onboarding ----------

    async def _whatsapp_action(
        self,
        lead_id: uuid.UUID,
        *,
        action: str,
        changes: dict,
        actor_id: uuid.UUID | None,
        detail: dict | None = None,
    ) -> Lead:
        """Applies one step of the group onboarding and records who did it.

        Every step goes through here so none of them can be taken without
        leaving an audit entry - the trail is the point of the feature, not a
        nicety, since "did anyone actually chase this candidate" is exactly
        what the board exists to answer.
        """
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")

        await self.leads.update(lead, {**changes, "whatsapp_handled_by": actor_id, "updated_by": actor_id})
        await self.audit.record(
            user_id=actor_id,
            action=action,
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"whatsapp": action, **(detail or {})},
        )
        return lead

    async def send_whatsapp_invite(
        self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None
    ) -> tuple[Lead, bool]:
        """Sends the group invite, and records that it went out - not that it
        was accepted.

        Returns (lead, delivered_automatically). Delivery is attempted through
        the Cloud API when credentials are configured; when they aren't, or the
        API refuses, the invite is still recorded and the caller opens a
        pre-written wa.me message for the coordinator to send by hand. Either
        way the candidate is now waiting to join, so the board reads the same.

        Deliberately does not touch group_assigned_at. Sending and joining used
        to be the same click, which meant the board reported candidates as
        group members on the strength of a message going out, and nobody was
        ever chased. Resending reuses this: the timestamp moves, restarting the
        wait, and the count goes up so the trail shows how many attempts it
        took.
        """
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        if lead.group_assigned_at is not None:
            raise BadRequestError(f"{lead.name} has already joined the group.")

        group_url = await self._group_url_for(lead)
        if not group_url:
            raise BadRequestError("No WhatsApp Group Link has been configured for this section.")

        result = await self.whatsapp.send_group_invite(phone=lead.phone, name=lead.name, group_url=group_url)

        resend = lead.whatsapp_invite_count > 0
        action = "WHATSAPP_INVITE_RESENT" if resend else "WHATSAPP_INVITE_SENT"
        updated = await self._whatsapp_action(
            lead_id,
            action=action,
            changes={
                "whatsapp_invite_sent_at": utcnow(),
                "whatsapp_invite_count": lead.whatsapp_invite_count + 1,
            },
            actor_id=actor_id,
            # Recorded on the audit entry so the history distinguishes an
            # invite the system delivered from one a coordinator sent by hand,
            # and names the reason when an automatic attempt was refused.
            detail={"delivery": "api" if result.delivered else "manual", "error": result.error},
        )
        return updated, result.delivered

    async def _group_url_for(self, lead: Lead) -> str | None:
        """The invite link for this lead's section, or None if the section has
        no link configured yet."""
        if not lead.section:
            return None
        for section in await FoundationFormConfigService().list_whatsapp_links():
            if section.code == lead.section:
                return section.whatsapp_group_url
        return None

    async def mark_whatsapp_joined(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> Lead:
        """Records that the candidate is actually in the group.

        Manual, because WhatsApp gives us no join event to listen for - see
        the note on the routes. Recorded as a manual mark in the audit trail
        precisely so that, if an integration ever does deliver join events,
        the two are distinguishable in the history.
        """
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        if lead.status != LeadStatus.BATCH_CONFIRMATION:
            raise BadRequestError("Only leads at the Batch Confirmation stage can be marked as joined.")

        return await self._whatsapp_action(
            lead_id,
            action="WHATSAPP_JOINED_MANUAL",
            changes={"group_assigned_at": utcnow()},
            actor_id=actor_id,
        )

    async def log_whatsapp_follow_up(self, lead_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> Lead:
        """Records that somebody chased this candidate.

        Doesn't change the status - they still haven't joined - it stops two
        coordinators working the same overdue row on the same day.
        """
        return await self._whatsapp_action(
            lead_id,
            action="WHATSAPP_FOLLOW_UP",
            changes={"whatsapp_last_follow_up_at": utcnow()},
            actor_id=actor_id,
        )

    async def remove_from_group(
        self, lead_id: uuid.UUID, *, reason: str | None, actor_id: uuid.UUID | None
    ) -> Lead:
        """Takes a non-paying student out of the batch group and off the board.

        One action, not two. Removing somebody from the group and marking them
        lost are the same decision - a student pulled out of the group for not
        paying is not coming back to it - and splitting them into two buttons
        leaves the pair half-done whenever somebody is interrupted between
        them.

        Clearing group_assigned_at is what takes them off the onboarding queue;
        LOST is what takes them out of the pipeline. Both, or the row lingers
        in one of the two places.

        The reason defaults to non-payment because that's the only route here,
        but is overridable - a coordinator removing somebody for another reason
        shouldn't have to record a wrong one.
        """
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")

        await self.leads.update(
            lead,
            {
                "group_assigned_at": None,
                "status": LeadStatus.LOST,
                "lost_reason": reason or "Removed from batch group - payment not received",
                "lost_at": utcnow(),
                "whatsapp_handled_by": actor_id,
                "updated_by": actor_id,
            },
        )
        await self.audit.record(
            user_id=actor_id,
            action="WHATSAPP_REMOVED",
            entity_type="Lead",
            entity_id=str(lead.id),
            changes={"whatsapp": "WHATSAPP_REMOVED", "reason": lead.lost_reason},
        )
        return lead

    async def whatsapp_history(self, lead_id: uuid.UUID) -> list[tuple]:
        """(action, actor name, when) for every onboarding step on this
        candidate, newest first."""
        entries, _ = await self.audit_logs.list(
            page=1,
            page_size=100,
            sort_by="created_at",
            sort_order="desc",
            filters={"entity_type": "Lead", "entity_id": str(lead_id)},
        )
        history = []
        for entry in entries:
            if not entry.action.startswith("WHATSAPP_"):
                continue
            user = await self.users.get_by_id(entry.user_id) if entry.user_id else None
            history.append(
                (entry.action, f"{user.first_name} {user.last_name}".strip() if user else None, entry.created_at)
            )
        return history

    async def send_whatsapp_invite_bulk(
        self, lead_ids: list[uuid.UUID], *, actor_id: uuid.UUID | None
    ) -> tuple[int, list[str]]:
        """Sends the group invite to a whole selection.

        Sends, not joins: the bulk action used to mark everybody as a group
        member in one press, which is the same mistake the single-row button
        made and worse for being applied to twenty people at once.

        Returns (sent, skipped_names). Skipping is reported rather than raised:
        one candidate who has already joined shouldn't discard the rest of a
        selection the coordinator has just worked through.
        """
        sent = 0
        skipped: list[str] = []
        for lead_id in lead_ids:
            lead = await self.leads.get_by_id(lead_id)
            if not lead:
                continue
            if lead.status != LeadStatus.BATCH_CONFIRMATION or lead.group_assigned_at is not None:
                skipped.append(lead.name)
                continue
            try:
                await self.send_whatsapp_invite(lead_id, actor_id=actor_id)
            except BadRequestError:
                # A section with no group link configured. Named in the skipped
                # list rather than aborting - the rest of the selection is
                # perfectly sendable.
                skipped.append(lead.name)
                continue
            sent += 1
        return sent, skipped

    async def set_hr_stage(
        self,
        lead_id: uuid.UUID,
        *,
        status: LeadStatus,
        lost_reason: str | None,
        actor_id: uuid.UUID | None,
    ) -> Lead:
        """Stage moves made from the coordinator's own tabs.

        Delegates to LeadService so the pipeline's rules (and the Lost-reason
        requirement) apply exactly as they do from the Admin board - this
        exists only so the move is reachable with the coordinator's
        permissions, which don't include leads.update.
        """
        # Imported here rather than at module scope: LeadService is a heavier
        # dependency only this one path needs.
        from app.schemas.lead_schema import LeadUpdate
        from app.services.lead_service import LeadService

        return await LeadService().update(
            lead_id, LeadUpdate(status=status, lost_reason=lost_reason), actor_id=actor_id
        )

    async def _tutor_name(self, tutor_id: uuid.UUID | None) -> str | None:
        if not tutor_id:
            return None
        tutor = await self.tutors.get_by_id(tutor_id)
        if not tutor:
            return None
        user = await self.users.get_by_id(tutor.user_id)
        return f"{user.first_name} {user.last_name}".strip() if user else None

    async def _build_readiness(self, batch) -> tuple[BatchReadinessResponse, list[BatchAllocation], list[Lead]]:
        live = await self.allocations.list_for_batch(
            batch.id, statuses=[AllocationStatus.ALLOCATED, AllocationStatus.CONFIRMED]
        )
        leads_by_id: dict[uuid.UUID, Lead] = {}
        for allocation in live:
            lead = await self.leads.get_by_id(allocation.lead_id)
            if lead:
                leads_by_id[allocation.lead_id] = lead

        allocated_count = len(live)
        paid_count = sum(1 for lead in leads_by_id.values() if _is_fully_paid(lead)[0])
        missing_email = [lead.name for lead in leads_by_id.values() if not lead.email]

        course = await self.courses.get_by_id(batch.course_id)
        tutor_name = await self._tutor_name(batch.tutor_id)

        checks = [
            ReadinessCheck(
                code="tutor_assigned",
                label="Tutor assigned",
                passed=batch.tutor_id is not None,
                detail=tutor_name or "No tutor assigned to this batch yet.",
            ),
            ReadinessCheck(
                code="minimum_strength",
                label=f"At least {MINIMUM_ALLOCATIONS} students",
                passed=allocated_count >= MINIMUM_ALLOCATIONS,
                detail=f"{allocated_count} of {MINIMUM_ALLOCATIONS} minimum allocated.",
            ),
            ReadinessCheck(
                code="within_capacity",
                label="Within capacity",
                passed=allocated_count <= batch.capacity,
                detail=f"{allocated_count} allocated against a capacity of {batch.capacity}.",
            ),
            ReadinessCheck(
                code="fees_cleared",
                label="Fees cleared",
                passed=allocated_count > 0 and paid_count == allocated_count,
                detail=f"{paid_count} of {allocated_count} have cleared their payment plan.",
            ),
            ReadinessCheck(
                code="contactable",
                label="Email on every student",
                passed=not missing_email,
                detail=(
                    "Missing for: " + ", ".join(missing_email)
                    if missing_email
                    else "Every allocated lead has an email address."
                ),
            ),
            ReadinessCheck(
                code="start_date_ahead",
                label="Start date not passed",
                passed=batch.start_date >= date.today(),
                detail=f"Starts {batch.start_date.isoformat()}.",
            ),
            ReadinessCheck(
                code="not_yet_confirmed",
                label="Awaiting confirmation",
                passed=batch.status == BatchStatus.UPCOMING,
                detail=f"Batch status is '{batch.status.value}'.",
            ),
        ]

        readiness = BatchReadinessResponse(
            batch_id=batch.id,
            batch_name=batch.name,
            course_id=batch.course_id,
            course_name=course.name if course else None,
            tutor_id=batch.tutor_id,
            tutor_name=tutor_name,
            start_date=batch.start_date,
            end_date=batch.end_date,
            schedule=batch.schedule,
            capacity=batch.capacity,
            status=batch.status,
            allocated_count=allocated_count,
            paid_count=paid_count,
            seats_remaining=max(batch.capacity - allocated_count, 0),
            fill_percent=round(allocated_count / batch.capacity * 100) if batch.capacity else 0,
            checks=checks,
            can_confirm=all(check.passed for check in checks),
        )
        return readiness, live, list(leads_by_id.values())

    async def list_batches(self) -> list[BatchReadinessResponse]:
        batches = await Batch.find(
            {"is_deleted": False, "status": {"$in": COORDINATOR_BATCH_STATUSES}}
        ).sort("+start_date").to_list()
        return [(await self._build_readiness(batch))[0] for batch in batches]

    async def get_batch(self, batch_id: uuid.UUID) -> BatchReadinessDetailResponse:
        batch = await self.batches.get_by_id(batch_id)
        if not batch:
            raise NotFoundError("Batch not found.")

        readiness, live, _ = await self._build_readiness(batch)
        roster = []
        for allocation in live:
            lead = await self.leads.get_by_id(allocation.lead_id)
            if not lead:
                continue
            roster.append(
                AllocatedLeadResponse(
                    allocation_id=allocation.id,
                    lead_id=lead.id,
                    name=lead.name,
                    email=lead.email,
                    phone=lead.phone,
                    status=allocation.status,
                    fully_paid=_is_fully_paid(lead)[0],
                    notes=allocation.notes,
                    allocated_at=allocation.created_at,
                )
            )
        return BatchReadinessDetailResponse(**readiness.model_dump(), allocations=roster)

    async def form_options(self) -> BatchFormOptionsResponse:
        """Dropdown data for the coordinator's "New Batch" form."""
        courses, _ = await self.courses.list(page=1, page_size=100, filters={"is_active": True})
        tutors, _ = await self.tutors.list(page=1, page_size=100, filters={"status": TutorStatus.ACTIVE})

        tutor_options = []
        for tutor in tutors:
            name = await self._tutor_name(tutor.id)
            tutor_options.append(OptionItem(id=tutor.id, label=name or "Unnamed tutor", detail=tutor.specialization))

        return BatchFormOptionsResponse(
            courses=[OptionItem(id=course.id, label=course.name, detail=course.code) for course in courses],
            tutors=tutor_options,
        )

    async def create_batch(self, data: BatchCreate, *, actor_id: uuid.UUID | None) -> Batch:
        """Delegates to BatchService so course/tutor validation and the audit
        entry stay in one place rather than being duplicated here."""
        return await BatchService().create(data, actor_id=actor_id)

    async def summary(self) -> CoordinatorSummaryResponse:
        pending = await self.list_pending_leads()
        batches = await self.list_batches()
        return CoordinatorSummaryResponse(
            pending_allocation=len(pending),
            allocated_awaiting_confirmation=await self.allocations.count_by_status(AllocationStatus.ALLOCATED),
            batches_ready_to_confirm=sum(1 for batch in batches if batch.can_confirm),
            batches_confirmed=sum(1 for batch in batches if batch.status == BatchStatus.CONFIRMED),
            students_placed=await self.allocations.count_by_status(AllocationStatus.CONFIRMED),
        )

    # ---------- Writes ----------

    async def allocate(
        self, lead_id: uuid.UUID, batch_id: uuid.UUID, *, notes: str | None, actor_id: uuid.UUID | None
    ) -> BatchAllocation:
        lead = await self.leads.get_by_id(lead_id)
        if not lead:
            raise NotFoundError("Lead not found.")
        if lead.status != LeadStatus.BATCH_CONFIRMATION:
            raise ValidationAppError("Only leads at the Batch Confirmation stage can be allocated to a batch.")

        batch = await self.batches.get_by_id(batch_id)
        if not batch:
            raise NotFoundError("Batch not found.")
        if batch.status != BatchStatus.UPCOMING:
            raise ConflictError(f"Batch '{batch.name}' is {batch.status.value} and no longer accepts allocations.")

        if await self.allocations.get_live_for_lead(lead_id):
            raise ConflictError(f"{lead.name} already holds a seat in a batch.")

        if await self.allocations.count_live_for_batch(batch_id) >= batch.capacity:
            raise ConflictError(f"Batch '{batch.name}' is full ({batch.capacity} seats).")

        allocation = BatchAllocation(
            lead_id=lead_id, batch_id=batch_id, notes=notes, created_by=actor_id, updated_by=actor_id
        )
        await self.allocations.create(allocation)
        await self.audit.record(
            user_id=actor_id,
            action="CREATE",
            entity_type="BatchAllocation",
            entity_id=str(allocation.id),
            changes={"lead_id": str(lead_id), "batch_id": str(batch_id)},
        )
        return allocation

    async def withdraw(
        self, allocation_id: uuid.UUID, *, reason: str | None, actor_id: uuid.UUID | None
    ) -> BatchAllocation:
        allocation = await self.allocations.get_by_id(allocation_id)
        if not allocation:
            raise NotFoundError("Allocation not found.")
        if allocation.status == AllocationStatus.CONFIRMED:
            raise ConflictError("This seat is already confirmed; the student is enrolled and cannot be withdrawn here.")
        if allocation.status == AllocationStatus.WITHDRAWN:
            raise ConflictError("This seat has already been withdrawn.")

        await self.allocations.update(
            allocation,
            {"status": AllocationStatus.WITHDRAWN, "withdrawn_reason": reason, "updated_by": actor_id},
        )
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="BatchAllocation",
            entity_id=str(allocation.id),
            changes={"status": AllocationStatus.WITHDRAWN.value, "reason": reason},
        )
        return allocation

    async def confirm_batch(self, batch_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> ConfirmBatchResponse:
        """Locks the roster: every allocated lead becomes a Student + Admission.

        MongoDB gives us no cross-document transaction on a standalone server,
        so this is deliberately re-runnable: a seat already carrying a
        student_id is skipped rather than duplicated, and the batch status flips
        only once every seat has been processed.
        """
        batch = await self.batches.get_by_id(batch_id)
        if not batch:
            raise NotFoundError("Batch not found.")

        readiness, live, _ = await self._build_readiness(batch)
        if not readiness.can_confirm:
            failed = [check.label for check in readiness.checks if not check.passed]
            raise ValidationAppError(f"Batch is not ready to confirm. Outstanding: {', '.join(failed)}.")

        course = await self.courses.get_by_id(batch.course_id)
        if not course:
            raise NotFoundError("The batch's course no longer exists.")

        students_created = 0
        admissions_created = 0
        confirmed_at = utcnow()

        for allocation in live:
            if allocation.status == AllocationStatus.CONFIRMED:
                continue

            lead = await self.leads.get_by_id(allocation.lead_id)
            if not lead:
                raise NotFoundError(f"Lead {allocation.lead_id} no longer exists; cannot confirm this batch.")

            email = (lead.email or "").lower()
            existing = await Student.find_one({"email": email, "is_deleted": False})
            if existing:
                # Returning learner: move them onto this batch rather than
                # inserting a duplicate, which the unique email index refuses.
                await self.students.update(
                    existing, {"batch_id": batch.id, "course_id": batch.course_id, "updated_by": actor_id}
                )
                student = existing
            else:
                first_name, last_name = _split_name(lead.name)
                student = Student(
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    phone=lead.phone,
                    course_id=batch.course_id,
                    batch_id=batch.id,
                    admission_date=date.today(),
                    status=StudentStatus.ACTIVE,
                    created_by=actor_id,
                    updated_by=actor_id,
                )
                await self.students.create(student)
                students_created += 1

            admission = Admission(
                lead_id=lead.id,
                student_id=student.id,
                course_id=batch.course_id,
                batch_id=batch.id,
                total_fee=course.fee,
                status=AdmissionStatus.CONFIRMED,
                admitted_by=actor_id,
                created_by=actor_id,
                updated_by=actor_id,
            )
            await self.admissions.create(admission)
            admissions_created += 1

            await self.allocations.update(
                allocation,
                {
                    "status": AllocationStatus.CONFIRMED,
                    "student_id": student.id,
                    "confirmed_at": confirmed_at,
                    "updated_by": actor_id,
                },
            )

        await self.batches.update(batch, {"status": BatchStatus.CONFIRMED, "updated_by": actor_id})
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Batch",
            entity_id=str(batch.id),
            changes={"status": BatchStatus.CONFIRMED.value, "students_created": students_created},
        )

        return ConfirmBatchResponse(
            batch_id=batch.id,
            batch_name=batch.name,
            status=BatchStatus.CONFIRMED,
            students_created=students_created,
            admissions_created=admissions_created,
            message=(
                f"'{batch.name}' confirmed with {admissions_created} student"
                f"{'' if admissions_created == 1 else 's'} enrolled."
            ),
        )
