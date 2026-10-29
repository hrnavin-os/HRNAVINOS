"""Business logic for the Student Portal.

The portal is the staff's: students never log in. What a student does - sign
the terms, join a class, open a recording - they do on a private link (/s/
<token>) that shows them their own batch and nothing else. Everything here is
either the staff board's view of a batch or one of those few student actions.

The terms come first. Until a student has agreed to them, their link shows the
terms and nothing more: no class links, no recordings. That gate is enforced
here, in what the public view returns and what opening a recording allows, not
in the page - a page can be bypassed.
"""
import re
import secrets
import uuid
from datetime import date, datetime

from fastapi import UploadFile

from app.config.settings import settings
from app.database.base import utcnow
from app.exceptions.base import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.batch import Batch
from app.models.class_session import ClassSession, SessionAttendance, resolve
from app.models.course import Course
from app.models.enums import StudentStatus
from app.models.induction_entry import FollowUpRemark, parse_batch
from app.models.student import Student, StudentTerms
from app.schemas.student_portal_schema import (
    AttendanceFacts,
    AttendanceTotals,
    BatchRosterResponse,
    CallRemarkResponse,
    ClassSessionCreate,
    ClassSessionResponse,
    ClassSessionUpdate,
    PortalBatchResponse,
    PortalStudentDetail,
    PortalStudentRow,
    PublicClass,
    PublicPortalResponse,
    SessionRosterResponse,
    SessionRosterRow,
    StudentSessionRow,
    StudentTermsResponse,
)
from app.services.attendance_board_service import AttendanceBoardService
from app.services.attendance_report_pdf import build_attendance_pdf
from app.services.audit_service import AuditService
from app.services.class_attendance_service import (
    ClassAttendanceService,
    ensure_row,
    local_today,
    parse_drive_file_id,
    record_recording_view,
)
from app.services.meet_attendance_service import MeetSyncError, format_meeting_code, normalize_meeting_code
from app.services.storage_service import StorageService
from app.services.student_enrollment_service import StudentEnrollmentService

PORTAL_PATH = "/s/{token}"


def portal_path(student: Student) -> str | None:
    return PORTAL_PATH.format(token=student.portal_token) if student.portal_token else None


def _meet_url(code: str | None) -> str | None:
    return f"https://meet.google.com/{format_meeting_code(code)}" if code else None


def _midnight(day: date) -> datetime:
    """How a `date` field is stored, and so what a query on one compares to."""
    return datetime.combine(day, datetime.min.time())


def _facts(row: SessionAttendance | None, *, held: bool) -> dict:
    attended, via = resolve(row, held=held)
    return AttendanceFacts(
        attended=attended,
        via=via,
        live=row.live if row else None,
        recording_viewed_at=row.recording_viewed_at if row else None,
        recording_opened_at=row.recording_opened_at if row else None,
        override=row.override if row else None,
        override_at=row.override_at if row else None,
        override_by_name=row.override_by_name if row else None,
        call_remarks=[
            CallRemarkResponse(remark=remark.remark, at=remark.at, by_name=remark.by_name)
            for remark in (row.call_remarks if row else [])
        ],
    ).model_dump()


def _totals(
    student_id: uuid.UUID,
    sessions: list[ClassSession],
    rows: dict[tuple[uuid.UUID, uuid.UUID], SessionAttendance],
    today: date,
) -> AttendanceTotals:
    """Attendance over the classes held so far. A class still to come is
    neither attended nor missed, so it is left out of both sides."""
    held = attended = live = recording = manual = 0
    for session in sessions:
        if session.held_on > today:
            continue
        held += 1
        present, via = resolve(rows.get((session.id, student_id)), held=True)
        if present:
            attended += 1
            live += via == "live"
            recording += via == "recording"
            manual += via == "manual"
    return AttendanceTotals(
        held=held,
        attended=attended,
        percent=round(attended * 100 / held, 1) if held else None,
        live=live,
        recording=recording,
        manual=manual,
    )


class StudentPortalService:
    def __init__(self) -> None:
        self.audit = AuditService()

    # ---------- Lookups ----------

    async def _batch(self, batch_id: uuid.UUID) -> Batch:
        batch = await Batch.get(batch_id)
        if not batch or batch.is_deleted:
            raise NotFoundError("Batch not found.")
        return batch

    async def _session(self, session_id: uuid.UUID) -> ClassSession:
        session = await ClassSession.get(session_id)
        if not session or session.is_deleted:
            raise NotFoundError("Class not found.")
        return session

    async def _student(self, student_id: uuid.UUID) -> Student:
        student = await Student.get(student_id)
        if not student or student.is_deleted:
            raise NotFoundError("Student not found.")
        return student

    async def _students_of(self, batch_id: uuid.UUID) -> list[Student]:
        return await Student.find({"batch_id": batch_id, "is_deleted": False}).sort("+first_name").to_list()

    async def _sessions_of(self, batch_id: uuid.UUID) -> list[ClassSession]:
        return await ClassSession.find({"batch_id": batch_id, "is_deleted": False}).sort("+sequence").to_list()

    async def _rows_for(self, sessions: list[ClassSession]) -> dict[tuple[uuid.UUID, uuid.UUID], SessionAttendance]:
        # By class rather than by the row's batch_id: a student moved to
        # another batch takes their old rows' batch_id with them.
        if not sessions:
            return {}
        rows = await SessionAttendance.find({"session_id": {"$in": [session.id for session in sessions]}}).to_list()
        return {(row.session_id, row.student_id): row for row in rows}

    def _session_response(
        self,
        session: ClassSession,
        students: list[Student],
        rows: dict[tuple[uuid.UUID, uuid.UUID], SessionAttendance],
        today: date,
    ) -> ClassSessionResponse:
        held = session.held_on <= today
        present = absent = live = recording = 0
        # A student who has dropped out isn't expected at the class, so they
        # are neither one of its absentees nor counted against it.
        for student in students:
            if student.status == StudentStatus.DROPPED:
                continue
            attended, via = resolve(rows.get((session.id, student.id)), held=held)
            present += attended is True
            absent += attended is False
            live += via == "live"
            recording += via == "recording"
        return ClassSessionResponse(
            id=session.id,
            batch_id=session.batch_id,
            sequence=session.sequence,
            title=session.title,
            held_on=session.held_on,
            start_time=session.start_time,
            meeting_code=format_meeting_code(session.meeting_code) if session.meeting_code else None,
            meet_url=_meet_url(session.meeting_code),
            min_minutes=session.min_minutes,
            recording_url=session.recording_url,
            recording_trackable=bool(session.recording_file_id),
            held=held,
            live_synced_at=session.live_synced_at,
            live_sync_error=session.live_sync_error,
            recording_synced_at=session.recording_synced_at,
            recording_sync_error=session.recording_sync_error,
            present_count=present,
            absent_count=absent,
            live_count=live,
            recording_count=recording,
            unmatched=session.unmatched,
        )

    # ---------- The board ----------

    async def batches(self) -> list[PortalBatchResponse]:
        """Every batch with students or classes in it, newest first. A batch
        with neither has nothing to manage.

        Brings the students into line with the leads at Batch Confirmation
        first, so whoever reached the stage since the last look is here."""
        await StudentEnrollmentService().sync()
        students = Student.get_motor_collection()
        sessions = ClassSession.get_motor_collection()
        student_counts = {
            row["_id"]: row
            async for row in students.aggregate(
                [
                    {"$match": {"is_deleted": False, "batch_id": {"$ne": None}}},
                    {
                        "$group": {
                            "_id": "$batch_id",
                            "count": {"$sum": 1},
                            "signed": {"$sum": {"$cond": [{"$ifNull": ["$terms", False]}, 1, 0]}},
                        }
                    },
                ]
            )
        }
        session_counts = {
            row["_id"]: row["count"]
            async for row in sessions.aggregate(
                [{"$match": {"is_deleted": False}}, {"$group": {"_id": "$batch_id", "count": {"$sum": 1}}}]
            )
        }
        batch_ids = set(student_counts) | set(session_counts)
        if not batch_ids:
            return []
        batches = await Batch.find({"_id": {"$in": list(batch_ids)}, "is_deleted": False}).to_list()
        # Latest start first. A batch opened from the leads has no dates, so
        # those follow, the highest batch number first and "No batch yet" last.
        batches.sort(
            key=lambda batch: (batch.start_date or date.min, parse_batch(batch.lead_batch) or 0),
            reverse=True,
        )
        courses = {
            course.id: course.name
            for course in await Course.find({"_id": {"$in": list({batch.course_id for batch in batches})}}).to_list()
        }
        return [
            PortalBatchResponse(
                id=batch.id,
                name=batch.name,
                course_name=courses.get(batch.course_id),
                status=batch.status,
                start_date=batch.start_date,
                end_date=batch.end_date,
                student_count=student_counts.get(batch.id, {}).get("count", 0),
                session_count=session_counts.get(batch.id, 0),
                terms_signed_count=student_counts.get(batch.id, {}).get("signed", 0),
            )
            for batch in batches
        ]

    async def _batch_response(self, batch: Batch, students: list[Student], sessions: list[ClassSession]):
        course = await Course.get(batch.course_id) if batch.course_id else None
        return PortalBatchResponse(
            id=batch.id,
            name=batch.name,
            course_name=course.name if course else None,
            status=batch.status,
            start_date=batch.start_date,
            end_date=batch.end_date,
            student_count=len(students),
            session_count=len(sessions),
            terms_signed_count=sum(1 for student in students if student.terms),
        )

    async def roster(self, batch_id: uuid.UUID) -> BatchRosterResponse:
        batch = await self._batch(batch_id)
        students = await self._students_of(batch.id)
        sessions = await self._sessions_of(batch.id)
        rows = await self._rows_for(sessions)
        today = local_today()
        return BatchRosterResponse(
            batch=await self._batch_response(batch, students, sessions),
            sessions=[self._session_response(session, students, rows, today) for session in sessions],
            students=[
                PortalStudentRow(
                    id=student.id,
                    name=student.full_name,
                    email=student.email,
                    phone=student.phone,
                    status=student.status,
                    terms_signed=student.terms is not None,
                    terms_accepted_at=student.terms.accepted_at if student.terms else None,
                    has_link=student.portal_token is not None,
                    totals=_totals(student.id, sessions, rows, today),
                )
                for student in students
            ],
            sync_configured=settings.meet_sync_configured,
        )

    async def attendance_pdf(self, batch_id: uuid.UUID) -> tuple[str, bytes]:
        """(filename, PDF bytes) for the batch's attendance report."""
        roster = await self.roster(batch_id)
        rows = await self._rows_for(await self._sessions_of(batch_id))
        today = local_today()
        content = build_attendance_pdf(roster, rows, generated_on=today)
        slug = re.sub(r"[^A-Za-z0-9]+", "-", roster.batch.name).strip("-") or "batch"
        return f"attendance-{slug}-{today:%Y-%m-%d}.pdf", content

    async def session_roster(self, session_id: uuid.UUID) -> SessionRosterResponse:
        session = await self._session(session_id)
        students = await self._students_of(session.batch_id)
        rows = await self._rows_for([session])
        today = local_today()
        held = session.held_on <= today
        return SessionRosterResponse(
            session=self._session_response(session, students, rows, today),
            rows=[
                SessionRosterRow(
                    student_id=student.id,
                    name=student.full_name,
                    email=student.email,
                    phone=student.phone,
                    status=student.status,
                    terms_signed=student.terms is not None,
                    **_facts(rows.get((session.id, student.id)), held=held),
                )
                for student in students
            ],
        )

    async def student_detail(self, student_id: uuid.UUID) -> PortalStudentDetail:
        student = await self._student(student_id)
        batch = await Batch.get(student.batch_id) if student.batch_id else None
        course = await Course.get(student.course_id) if student.course_id else None
        sessions = await self._sessions_of(student.batch_id) if student.batch_id else []
        rows = await self._rows_for(sessions)
        today = local_today()
        terms = student.terms
        return PortalStudentDetail(
            id=student.id,
            name=student.full_name,
            email=student.email,
            phone=student.phone,
            status=student.status,
            admission_date=student.admission_date,
            batch_id=student.batch_id,
            batch_name=batch.name if batch else None,
            course_name=course.name if course else None,
            terms=StudentTermsResponse(**terms.model_dump(exclude={"recorded_by"})) if terms else None,
            portal_path=portal_path(student),
            totals=_totals(student.id, sessions, rows, today),
            sessions=[
                StudentSessionRow(
                    session_id=session.id,
                    sequence=session.sequence,
                    title=session.title,
                    held_on=session.held_on,
                    held=session.held_on <= today,
                    **_facts(rows.get((session.id, student.id)), held=session.held_on <= today),
                )
                for session in sessions
            ],
        )

    # ---------- Classes ----------

    @staticmethod
    def _meeting_code(value: str | None) -> str | None:
        if not value or not value.strip():
            return None
        code = normalize_meeting_code(value)
        if not code:
            raise BadRequestError("That isn't a Google Meet link or code - it looks like abc-defg-hij.")
        return code

    @staticmethod
    def _recording(value: str | None) -> tuple[str | None, str | None]:
        url = (value or "").strip()
        if not url:
            return None, None
        if not url.startswith(("https://", "http://")):
            raise BadRequestError("The recording link has to be a web link, starting https://.")
        return url, parse_drive_file_id(url)

    async def _sequence_free(self, batch_id: uuid.UUID, sequence: int, *, exclude: uuid.UUID | None = None) -> None:
        query: dict = {"batch_id": batch_id, "sequence": sequence, "is_deleted": False}
        if exclude:
            query["_id"] = {"$ne": exclude}
        if await ClassSession.find_one(query):
            raise ConflictError(f"This batch already has a class {sequence}.")

    async def _try_sync(self, session: ClassSession) -> None:
        """Reads a class that has already happened straight away, so adding
        last night's class shows last night's attendance now rather than at
        the next interval. A failure is recorded on the class and shown there."""
        if settings.meet_sync_configured and session.held_on <= local_today():
            try:
                await ClassAttendanceService().sync(session)
            except MeetSyncError:
                pass

    async def create_session(
        self, batch_id: uuid.UUID, data: ClassSessionCreate, *, actor_id: uuid.UUID | None
    ) -> ClassSession:
        batch = await self._batch(batch_id)
        await self._sequence_free(batch.id, data.sequence)
        recording_url, file_id = self._recording(data.recording_url)
        session = ClassSession(
            batch_id=batch.id,
            sequence=data.sequence,
            title=data.title.strip(),
            held_on=data.held_on,
            start_time=data.start_time,
            meeting_code=self._meeting_code(data.meeting),
            min_minutes=data.min_minutes,
            recording_url=recording_url,
            recording_file_id=file_id,
            created_by=actor_id,
            updated_by=actor_id,
        )
        await session.insert()
        await self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="ClassSession", entity_id=str(session.id)
        )
        await self._try_sync(session)
        return session

    async def update_session(
        self, session_id: uuid.UUID, data: ClassSessionUpdate, *, actor_id: uuid.UUID | None
    ) -> ClassSession:
        session = await self._session(session_id)
        changes = data.model_dump(exclude_unset=True)
        before = (session.meeting_code, session.held_on, session.recording_url, session.recording_file_id)
        if changes.get("sequence") is not None and changes["sequence"] != session.sequence:
            await self._sequence_free(session.batch_id, changes["sequence"], exclude=session.id)
            session.sequence = changes["sequence"]
        if changes.get("title") is not None:
            session.title = changes["title"].strip()
        if changes.get("held_on") is not None:
            session.held_on = changes["held_on"]
        if "start_time" in changes:
            session.start_time = changes["start_time"]
        if changes.get("min_minutes") is not None:
            session.min_minutes = changes["min_minutes"]
        if "meeting" in changes:
            session.meeting_code = self._meeting_code(changes["meeting"])
        if "recording_url" in changes:
            session.recording_url, session.recording_file_id = self._recording(changes["recording_url"])

        # What a sync read belongs to the meeting and day it read, and the file
        # it read views of. Point the class at another, and those facts are
        # about something that is no longer this class - a wrong Meet code
        # corrected the next morning must not leave the wrong call's people
        # marked present. The next sync reads the right one.
        reset: dict = {}
        if (session.meeting_code, session.held_on) != before[:2]:
            reset["live"] = None
            session.unmatched = []
            session.live_synced_at = None
            session.live_sync_error = None
        # The same Drive file under a differently-shaped link is still the
        # same recording; only a different file starts the views again.
        if (session.recording_file_id or session.recording_url) != (before[3] or before[2]):
            reset["recording_viewed_at"] = None
            reset["recording_opened_at"] = None
            session.recording_synced_at = None
            session.recording_sync_error = None
        if reset:
            await SessionAttendance.get_motor_collection().update_many(
                {"session_id": session.id}, {"$set": {**reset, "updated_at": utcnow()}}
            )
        session.touch(actor_id)
        await session.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="ClassSession",
            entity_id=str(session.id),
            changes={"fields": sorted(changes)},
        )
        await self._try_sync(session)
        return session

    async def delete_session(self, session_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        """Removes a class and every student's attendance at it. Hard, like
        unlinking a meeting: a class that was never held, or was added twice,
        leaves nothing worth keeping, and a soft-deleted one would still hold
        its sequence number against the batch."""
        session = await self._session(session_id)
        await SessionAttendance.get_motor_collection().delete_many({"session_id": session.id})
        await session.delete()
        await self.audit.record(
            user_id=actor_id,
            action="DELETE",
            entity_type="ClassSession",
            entity_id=str(session.id),
            changes={"batch_id": str(session.batch_id), "sequence": session.sequence, "title": session.title},
        )

    async def sync_session(self, session_id: uuid.UUID) -> ClassSession:
        session = await self._session(session_id)
        if not settings.meet_sync_configured:
            raise BadRequestError("Google Meet and Drive sync isn't set up on the server yet.")
        try:
            await ClassAttendanceService().sync(session)
        except MeetSyncError as exc:
            raise BadRequestError(str(exc)) from exc
        return session

    # ---------- Attendance ----------

    async def _student_in(self, session: ClassSession, student_id: uuid.UUID) -> Student:
        student = await self._student(student_id)
        if student.batch_id != session.batch_id:
            raise BadRequestError("That student isn't in this class's batch.")
        return student

    async def set_override(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        attended: bool | None,
        *,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
    ) -> None:
        session = await self._session(session_id)
        student = await self._student_in(session, student_id)
        await ensure_row(session, student.id)
        cleared = attended is None
        await SessionAttendance.get_motor_collection().update_one(
            {"session_id": session.id, "student_id": student.id},
            {
                "$set": {
                    "override": attended,
                    "override_at": None if cleared else utcnow(),
                    "override_by": None if cleared else actor_id,
                    "override_by_name": None if cleared else actor_name,
                    "updated_at": utcnow(),
                }
            },
        )
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="SessionAttendance",
            entity_id=f"{session.id}:{student.id}",
            changes={"override": attended},
        )

    async def add_call_remark(
        self,
        session_id: uuid.UUID,
        student_id: uuid.UUID,
        remark: str,
        *,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
    ) -> None:
        session = await self._session(session_id)
        student = await self._student_in(session, student_id)
        await ensure_row(session, student.id)
        entry = FollowUpRemark(remark=remark.strip(), at=utcnow(), by=actor_id, by_name=actor_name)
        await SessionAttendance.get_motor_collection().update_one(
            {"session_id": session.id, "student_id": student.id},
            {"$push": {"call_remarks": entry.model_dump()}, "$set": {"updated_at": utcnow()}},
        )

    # ---------- The student's link ----------

    async def issue_link(self, student_id: uuid.UUID, *, regenerate: bool, actor_id: uuid.UUID | None) -> Student:
        """The student's private link, issued on first ask. `regenerate`
        replaces it, and the old link stops working at once - the way to deal
        with one that has been forwarded to somebody it shouldn't have."""
        student = await self._student(student_id)
        if student.portal_token and not regenerate:
            return student
        student.portal_token = secrets.token_urlsafe(18)
        student.touch(actor_id)
        await student.save()
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Student",
            entity_id=str(student.id),
            changes={"portal_link": "regenerated" if regenerate else "issued"},
        )
        return student

    async def _terms(
        self,
        student: Student,
        *,
        signed_name: str,
        file: UploadFile | None,
        source: str,
        actor_id: uuid.UUID | None = None,
        actor_name: str | None = None,
        ip: str | None = None,
    ) -> Student:
        name = signed_name.strip()
        if len(name) < 2:
            raise BadRequestError("Type the student's full name as the signature.")
        document = await AttendanceBoardService().get_document()
        copy_url = await StorageService().save_document(file, subdir="terms") if file else None
        student.terms = StudentTerms(
            accepted_at=utcnow(),
            signed_name=name[:150],
            document_title=document.title,
            document_updated_at=document.updated_at,
            signed_copy_url=copy_url,
            source=source,
            recorded_by=actor_id,
            recorded_by_name=actor_name,
            ip=ip,
        )
        student.touch(actor_id)
        await student.save()
        await self.audit.record(
            user_id=actor_id,
            action="TERMS_SIGNED",
            entity_type="Student",
            entity_id=str(student.id),
            changes={"source": source, "signed_copy": bool(copy_url)},
            ip_address=ip,
        )
        return student

    async def record_terms(
        self,
        student_id: uuid.UUID,
        *,
        signed_name: str,
        file: UploadFile | None,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
    ) -> Student:
        """A signature taken some other way - on paper, on WhatsApp - recorded
        by a member of staff, with the copy they were sent."""
        student = await self._student(student_id)
        return await self._terms(
            student, signed_name=signed_name, file=file, source="staff", actor_id=actor_id, actor_name=actor_name
        )

    async def clear_terms(self, student_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> Student:
        """Takes back a signature recorded against the wrong student. Their
        link goes back to showing the terms."""
        student = await self._student(student_id)
        if student.terms is None:
            return student
        withdrawn = student.terms
        student.terms = None
        student.touch(actor_id)
        await student.save()
        await self.audit.record(
            user_id=actor_id,
            action="TERMS_CLEARED",
            entity_type="Student",
            entity_id=str(student.id),
            changes={"signed_name": withdrawn.signed_name, "accepted_at": withdrawn.accepted_at.isoformat()},
        )
        return student

    # ---------- What the student sees ----------

    async def by_token(self, token: str) -> Student:
        """The student a link belongs to. A dropped student's link stops
        working with the rest of their enrolment."""
        student = await Student.find_one({"portal_token": token, "is_deleted": False}) if token else None
        if not student or student.status == StudentStatus.DROPPED:
            raise NotFoundError("This link is no longer active. Please contact the institute for a new one.")
        return student

    async def public_view(self, token: str) -> PublicPortalResponse:
        student = await self.by_token(token)
        document = await AttendanceBoardService().get_document()
        batch = await Batch.get(student.batch_id) if student.batch_id else None
        course = await Course.get(student.course_id) if student.course_id else None

        classes: list[PublicClass] = []
        if student.terms and batch:
            sessions = await self._sessions_of(batch.id)
            rows = await self._rows_for(sessions)
            today = local_today()
            for session in sessions:
                row = rows.get((session.id, student.id))
                classes.append(
                    PublicClass(
                        id=session.id,
                        sequence=session.sequence,
                        title=session.title,
                        held_on=session.held_on,
                        start_time=session.start_time,
                        meet_url=_meet_url(session.meeting_code) if session.held_on >= today else None,
                        has_recording=bool(session.recording_url),
                        watched=bool(row and (row.recording_viewed_at or row.recording_opened_at)),
                    )
                )
        return PublicPortalResponse(
            name=student.full_name,
            batch_name=batch.name if batch else None,
            course_name=course.name if course else None,
            terms_signed=student.terms is not None,
            terms_accepted_at=student.terms.accepted_at if student.terms else None,
            terms_title=document.title,
            terms_body=document.body,
            classes=classes,
        )

    async def accept_terms(
        self, token: str, *, signed_name: str, agreed: bool, file: UploadFile | None, ip: str | None
    ) -> Student:
        student = await self.by_token(token)
        if student.terms is not None:
            # Signing twice changes nothing; the first agreement stands.
            return student
        if not agreed:
            raise BadRequestError("Tick the box to agree to the Terms & Conditions.")
        return await self._terms(student, signed_name=signed_name, file=file, source="link", ip=ip)

    async def open_recording(self, token: str, session_id: uuid.UUID) -> str:
        """The recording's link, recorded as opened. Handed out here rather than
        printed on the page, so every open from the link is counted and the
        terms gate can't be stepped around by reading the page source."""
        student = await self.by_token(token)
        if student.terms is None:
            raise ForbiddenError("Please agree to the Terms & Conditions first.")
        session = await ClassSession.get(session_id)
        if not session or session.is_deleted or session.batch_id != student.batch_id:
            raise NotFoundError("Class not found.")
        if not session.recording_url:
            raise NotFoundError("This class has no recording yet.")
        await record_recording_view(session, student.id, utcnow(), field="recording_opened_at")
        return session.recording_url
