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
from app.exceptions.base import ConflictError, NotFoundError, ValidationAppError
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
)
from app.models.lead import Lead
from app.models.student import Student
from app.repositories.admission_repository import AdmissionRepository
from app.repositories.batch_allocation_repository import BatchAllocationRepository
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.student_repository import StudentRepository
from app.repositories.tutor_repository import TutorRepository
from app.repositories.user_repository import UserRepository
from app.schemas.batch_confirmation_schema import (
    AllocatedLeadResponse,
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
                    created_at=lead.created_at,
                )
            )
        return pending

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
