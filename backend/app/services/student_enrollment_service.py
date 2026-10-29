"""Enrolment for the Student Portal: the leads at Batch Confirmation, as students.

Batch Confirmation is the last stage a lead reaches - Finance has approved
them - and the portal is where staff run their classes from there. So every
lead at that stage is a student in the portal, in the batch the leads boards
show them in ("Batch-20"), without anybody enrolling them by hand. A lead with
no batch yet sits in "No batch yet" until one is given.

Reconciled rather than pushed. A lead reaches the stage, changes batch or
leaves from too many places (Finance approval, Move to Stage, the HR board,
the Induction form, a sheet import) for each of them to remember to tell the
portal, so the portal brings its students into line with the leads every time
it lists its batches, and whatever moved since is picked up then.

The allocate-and-confirm flow in BatchConfirmationService made students too,
but nothing on screen has reached it since the coordinator's batch panel was
taken off; students it made carry no lead_id and are left alone here.
"""
import asyncio
import uuid
from datetime import date, timedelta

from pymongo.errors import DuplicateKeyError

from app.config.settings import settings
from app.database.base import utcnow
from app.models.batch import Batch
from app.models.enums import BatchStatus, LeadStatus, StudentStatus
from app.models.induction_entry import lead_batch_label
from app.models.lead import Lead
from app.models.student import Student
from app.repositories.student_repository import StudentRepository
from app.services.audit_service import AuditService
from app.services.batch_confirmation_service import BatchConfirmationService
from app.services.class_attendance_service import local_today

NO_BATCH = "No batch yet"

# One reconcile at a time in this process, so two people opening the portal
# together don't both enrol the same lead. Across processes it is the unique
# indexes on Batch.lead_batch and Student.lead_id that hold the line.
_lock = asyncio.Lock()


def _names(full_name: str) -> tuple[str, str]:
    """A lead carries one `name`; a Student wants first and last."""
    parts = full_name.strip().split(maxsplit=1)
    if not parts:
        return "Unknown", ""
    return parts[0][:100], parts[1][:100] if len(parts) > 1 else ""


def _admitted_on(lead: Lead) -> date:
    """The day Finance approved the lead, which is the day they reached Batch
    Confirmation, in the institute's zone. Today for a lead moved there by
    hand with no approval on record."""
    if lead.finance_approved_at is None:
        return local_today()
    return (lead.finance_approved_at + timedelta(minutes=settings.MEET_UTC_OFFSET_MINUTES)).date()


class StudentEnrollmentService:
    def __init__(self) -> None:
        self.students = StudentRepository()
        self.audit = AuditService()

    async def sync(self) -> None:
        async with _lock:
            await self._sync()

    async def _sync(self) -> None:
        # Oldest first, so of one person's two leads it is the first that
        # holds their student.
        leads = await Lead.find(
            {"is_deleted": False, "reviewed": {"$ne": False}, "status": LeadStatus.BATCH_CONFIRMATION}
        ).sort("+created_at").to_list()
        at_stage = {lead.id for lead in leads}

        # The batch each lead is shown in everywhere else - the induction
        # batch, or failing that the one typed on the lead.
        induction = await BatchConfirmationService().batches_for(leads)
        label_of = {
            lead.id: induction.get(lead.id) or lead_batch_label(None, lead.batch_number) or NO_BATCH
            for lead in leads
        }
        batch_of = await self._batches(set(label_of.values()))

        # Deleted ones included: a student removed by hand stays removed, and
        # a deleted record still holds its email and lead in the unique indexes.
        enrolled = {
            student.lead_id: student
            for student in await Student.find({"lead_id": {"$in": list(at_stage)}}).to_list()
        }
        emails = [lead.email.lower() for lead in leads if lead.id not in enrolled and lead.email]
        by_email = (
            {student.email: student for student in await Student.find({"email": {"$in": emails}}).to_list()}
            if emails
            else {}
        )

        for lead in leads:
            batch_id = batch_of[label_of[lead.id]]
            student = enrolled.get(lead.id)
            if student is not None:
                if not student.is_deleted:
                    await self._keep_current(student, lead.id, batch_id)
                continue

            email = lead.email.lower() if lead.email else None
            other = by_email.get(email) if email else None
            if other is not None and other.lead_id in at_stage:
                # The same person on a second lead, already enrolled from the first.
                continue
            if other is not None:
                # A student on record already - made on the Students page, or
                # from a lead of theirs that has since left the stage.
                await self._keep_current(other, lead.id, batch_id)
                continue
            student = await self._enrol(lead, email, batch_id)
            if student is not None and email:
                by_email[email] = student

        await self._drop_leavers(at_stage)

    async def _batches(self, labels: set[str]) -> dict[str, uuid.UUID]:
        """{label: batch id}, opening a batch for each label without one."""
        found = {
            batch.lead_batch: batch.id
            for batch in await Batch.find({"lead_batch": {"$in": list(labels)}, "is_deleted": False}).to_list()
        }
        for label in labels - found.keys():
            # Ongoing rather than Confirmed: the coordinator's allocate and
            # confirm endpoints work on Upcoming and Confirmed batches, and
            # one opened here has no course or dates for their checks.
            batch = Batch(name=label, lead_batch=label, status=BatchStatus.ONGOING)
            try:
                await batch.insert()
            except DuplicateKeyError:
                # Opened by another process in the meantime.
                batch = await Batch.find_one({"lead_batch": label, "is_deleted": False})
            found[label] = batch.id
        return found

    async def _enrol(self, lead: Lead, email: str | None, batch_id: uuid.UUID) -> Student | None:
        first_name, last_name = _names(lead.name)
        student = Student(
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=lead.phone,
            batch_id=batch_id,
            admission_date=_admitted_on(lead),
            status=StudentStatus.ACTIVE,
            lead_id=lead.id,
        )
        try:
            await self.students.create(student)
        except DuplicateKeyError:
            # Enrolled by another process in the meantime; the next sync finds it.
            return None
        await self.audit.record(
            user_id=None,
            action="CREATE",
            entity_type="Student",
            entity_id=str(student.id),
            changes={"lead_id": str(lead.id), "batch_id": str(batch_id)},
        )
        return student

    async def _keep_current(self, student: Student, lead_id: uuid.UUID, batch_id: uuid.UUID) -> None:
        """Keeps a student on their lead and in their lead's batch. Moving a
        student is done by changing the lead's batch, as everywhere else."""
        changes: dict = {}
        if student.lead_id != lead_id:
            changes["lead_id"] = lead_id
        if student.batch_id != batch_id:
            changes["batch_id"] = batch_id
        if student.lead_left_at is not None:
            # Back at the stage after the portal dropped them for leaving it.
            # Undone only if nobody has set a status of their own since.
            changes["lead_left_at"] = None
            if student.status == StudentStatus.DROPPED:
                changes["status"] = StudentStatus.ACTIVE
        if student.is_deleted:
            # Only ever an unlinked record taken up again by its email; one
            # deleted while on this lead is left deleted by _sync.
            student.restore()
            changes["is_deleted"] = False
        if not changes:
            return
        await self.students.update(student, changes)
        await self.audit.record(
            user_id=None,
            action="UPDATE",
            entity_type="Student",
            entity_id=str(student.id),
            changes={key: str(value) if value is not None else None for key, value in changes.items()},
        )

    async def _drop_leavers(self, at_stage: set[uuid.UUID]) -> None:
        """Drops the students whose lead has left Batch Confirmation - marked
        Lost, or deleted. A completed student stays completed."""
        leavers = await Student.find(
            {
                "lead_id": {"$ne": None, "$nin": list(at_stage)},
                "is_deleted": False,
                "status": {"$in": [StudentStatus.ACTIVE, StudentStatus.ON_HOLD]},
            }
        ).to_list()
        for student in leavers:
            await self.students.update(student, {"status": StudentStatus.DROPPED, "lead_left_at": utcnow()})
            await self.audit.record(
                user_id=None,
                action="UPDATE",
                entity_type="Student",
                entity_id=str(student.id),
                changes={"status": StudentStatus.DROPPED.value, "reason": "lead left Batch Confirmation"},
            )
