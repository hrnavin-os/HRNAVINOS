"""Request/response DTOs for the Student Portal: the staff board, and the
student's own private link."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.class_session import AttendedVia, LivePresence, UnmatchedAttendee
from app.models.enums import BatchStatus, StudentStatus

# "19:00" or "7:30". A display string, not a time - see ClassSession.start_time.
START_TIME_PATTERN = r"^([01]?\d|2[0-3]):[0-5]\d$"


# ---------- Classes ----------


class ClassSessionCreate(BaseModel):
    sequence: int = Field(ge=1, le=500)
    title: str = Field(min_length=1, max_length=150)
    held_on: date
    start_time: str | None = Field(default=None, pattern=START_TIME_PATTERN)
    end_time: str | None = Field(default=None, pattern=START_TIME_PATTERN)
    # A Meet link or code ("abc-defg-hij"). Optional: a lesson can be
    # recording-only.
    meeting: str | None = Field(default=None, max_length=300)
    min_minutes: int = Field(default=10, ge=0, le=600)
    recording_url: str | None = Field(default=None, max_length=500)


class ClassSessionUpdate(BaseModel):
    """Every field optional. An empty string clears `meeting` and
    `recording_url` - that is how a wrong link is taken off a class."""

    sequence: int | None = Field(default=None, ge=1, le=500)
    title: str | None = Field(default=None, min_length=1, max_length=150)
    held_on: date | None = None
    start_time: str | None = Field(default=None, pattern=START_TIME_PATTERN)
    end_time: str | None = Field(default=None, pattern=START_TIME_PATTERN)
    meeting: str | None = Field(default=None, max_length=300)
    min_minutes: int | None = Field(default=None, ge=0, le=600)
    recording_url: str | None = Field(default=None, max_length=500)


class ClassSessionResponse(BaseModel):
    id: uuid.UUID
    batch_id: uuid.UUID
    sequence: int
    title: str
    held_on: date
    start_time: str | None
    end_time: str | None
    # "abc-defg-hij", as Meet prints it, and the link built from it.
    meeting_code: str | None
    meet_url: str | None
    min_minutes: int
    recording_url: str | None
    # Whether views of the recording can be read from the Drive audit log -
    # only a Drive link can.
    recording_trackable: bool
    held: bool
    live_synced_at: datetime | None
    live_sync_error: str | None
    recording_synced_at: datetime | None
    recording_sync_error: str | None
    present_count: int
    absent_count: int
    live_count: int
    recording_count: int
    unmatched: list[UnmatchedAttendee]


# ---------- The batch ----------


class PortalBatchResponse(BaseModel):
    id: uuid.UUID
    name: str
    course_name: str | None
    status: BatchStatus
    # None on a batch opened from the leads until staff give it dates.
    start_date: date | None
    end_date: date | None
    student_count: int
    session_count: int
    terms_signed_count: int


class AttendanceTotals(BaseModel):
    """A student's attendance over the classes held so far."""

    held: int
    attended: int
    # None until a class has been held - 0% of nothing isn't a figure.
    percent: float | None
    live: int
    recording: int
    manual: int


class PortalStudentRow(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    status: StudentStatus
    terms_signed: bool
    terms_accepted_at: datetime | None
    has_link: bool
    totals: AttendanceTotals


class BatchRosterResponse(BaseModel):
    batch: PortalBatchResponse
    sessions: list[ClassSessionResponse]
    students: list[PortalStudentRow]
    # Whether the server can read the Meet and Drive audit logs at all.
    sync_configured: bool


# ---------- One class's roll ----------


class CallRemarkResponse(BaseModel):
    remark: str
    at: datetime
    by_name: str | None


class AttendanceFacts(BaseModel):
    """Everything known about one student at one class, and what it adds up to."""

    attended: bool | None
    via: AttendedVia | None
    live: LivePresence | None
    recording_viewed_at: datetime | None
    recording_opened_at: datetime | None
    override: bool | None
    override_at: datetime | None
    override_by_name: str | None
    call_remarks: list[CallRemarkResponse]


class SessionRosterRow(AttendanceFacts):
    student_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    status: StudentStatus
    terms_signed: bool


class SessionRosterResponse(BaseModel):
    session: ClassSessionResponse
    rows: list[SessionRosterRow]


# ---------- One student ----------


class StudentTermsResponse(BaseModel):
    accepted_at: datetime
    signed_name: str
    document_title: str
    document_updated_at: datetime | None
    signed_copy_url: str | None
    source: str
    recorded_by_name: str | None
    ip: str | None


class StudentSessionRow(AttendanceFacts):
    session_id: uuid.UUID
    sequence: int
    title: str
    held_on: date
    held: bool


class PortalStudentDetail(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    status: StudentStatus
    admission_date: date
    batch_id: uuid.UUID | None
    batch_name: str | None
    course_name: str | None
    terms: StudentTermsResponse | None
    # "/s/<token>", or None until a link has been issued. The page builds the
    # full URL from its own origin.
    portal_path: str | None
    totals: AttendanceTotals
    sessions: list[StudentSessionRow]


# ---------- Writes ----------


class AttendanceOverride(BaseModel):
    # True present, False absent, None hands the answer back to the sync.
    attended: bool | None


class CallRemarkCreate(BaseModel):
    remark: str = Field(min_length=1, max_length=1000)


class AttendanceChecks(BaseModel):
    """The register's start (H) and end (C) checks. Only the ones sent are
    changed: True ticked, False unticked, None handed back to Meet."""

    start: bool | None = None
    end: bool | None = None


# ---------- The register ----------


class RegisterSession(BaseModel):
    id: uuid.UUID
    sequence: int
    title: str
    held_on: date
    start_time: str | None
    end_time: str | None
    held: bool


class RegisterCell(BaseModel):
    """One student at one class, as a line of the attendance sheet reads."""

    session_id: uuid.UUID
    # None for a class still to come, or one Meet hasn't been read for yet.
    start: bool | None
    end: bool | None
    # Ticked by a member of staff rather than read from Meet.
    start_marked: bool
    end_marked: bool
    attended: bool | None
    via: AttendedVia | None
    override: bool | None
    call_remarks: list[CallRemarkResponse]
    # What the data says about the day, for a cell nobody has written a
    # remark in: "Left early", "Watched the recording", "Only 4 min".
    note: str | None


class RegisterRow(BaseModel):
    student_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    status: StudentStatus
    # The lead's section, and the sheet's batch code built from it: "B-29A".
    section: str | None
    code: str | None
    cells: list[RegisterCell]
    totals: AttendanceTotals


class AttendanceRegisterResponse(BaseModel):
    batch_id: uuid.UUID
    batch_name: str
    sessions: list[RegisterSession]
    rows: list[RegisterRow]
    sync_configured: bool


class PortalLinkResponse(BaseModel):
    portal_path: str


# ---------- The student's private link ----------


class PublicClass(BaseModel):
    id: uuid.UUID
    sequence: int
    title: str
    held_on: date
    start_time: str | None
    # Only for a class still to come (or today's): past classes are watched
    # from the recording.
    meet_url: str | None
    has_recording: bool
    watched: bool


class PublicPortalResponse(BaseModel):
    name: str
    batch_name: str | None
    course_name: str | None
    terms_signed: bool
    terms_accepted_at: datetime | None
    terms_title: str
    terms_body: str
    # Empty until the terms are signed - nothing else on the page is
    # reachable before then.
    classes: list[PublicClass]


class RecordingLinkResponse(BaseModel):
    url: str
