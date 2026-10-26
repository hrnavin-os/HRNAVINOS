"""The Student Portal's classes, and each student's attendance at them.

A ClassSession is one class of a batch: its place in the course (sequence),
the day it is held, the Google Meet it is held in, and the Drive recording it
leaves behind. Meet saves the recording to Drive by itself; pasting that link
here is what puts it in front of the batch.

A SessionAttendance is one student at one class. It keeps the facts apart -
whether they were in the live call, whether they watched the recording, and
what a member of staff said - rather than one "attended" flag, because each
comes from somewhere different and is corrected differently:

- `live` is rebuilt from the Meet audit log on every sync;
- the recording view times only ever move earlier, since the Drive audit log
  forgets after six months and a later sync must not undo an earlier one;
- `override` is a person's answer, which no sync touches.

Whether the student attended is derived from those on read (see `resolve`),
so it can never disagree with them.
"""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument
from app.models.induction_entry import FollowUpRemark


class UnmatchedAttendee(BaseModel):
    """Somebody the Meet audit log saw in a class who is on nobody's record
    in the batch - usually a student who joined from another email address.
    Correcting the student's email picks them up on the next sync."""

    identifier: str = Field(max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    duration_seconds: int = 0


class ClassSession(BaseDocument):
    batch_id: uuid.UUID
    # Lesson number within the batch: 1 is the first class. The order the
    # recordings are watched in, and what drip learning will unlock by.
    sequence: int = Field(ge=1, le=500)
    title: str = Field(max_length=150)
    held_on: date
    # "19:00" - shown to the student beside the Meet link. Display only: the
    # sync reads the whole day, so a class that starts late still counts.
    start_time: str | None = Field(default=None, max_length=10)
    # Lower-case letters only, as normalize_meeting_code returns it. None for
    # a class with no live session (a recording-only lesson).
    meeting_code: str | None = Field(default=None, max_length=32)
    # Less time than this in the call is "joined, but too briefly to count".
    min_minutes: int = Field(default=10, ge=0, le=600)
    recording_url: str | None = Field(default=None, max_length=500)
    # Read out of recording_url. The Drive audit log names files by id, and a
    # share link can carry it in several shapes.
    recording_file_id: str | None = Field(default=None, max_length=100)

    live_synced_at: datetime | None = None
    live_sync_error: str | None = Field(default=None, max_length=500)
    recording_synced_at: datetime | None = None
    recording_sync_error: str | None = Field(default=None, max_length=500)
    unmatched: list[UnmatchedAttendee] = Field(default_factory=list)

    class Settings:
        name = "class_sessions"
        indexes = [
            IndexModel([("batch_id", 1), ("sequence", 1)], unique=True, name="uq_class_session_batch_sequence"),
            IndexModel([("held_on", -1)]),
        ]

    def __repr__(self) -> str:
        return f"<ClassSession batch={self.batch_id} #{self.sequence}>"


class LivePresence(BaseModel):
    """A student's time in the live call, rolled up from the audit log."""

    joined_at: datetime
    left_at: datetime
    duration_seconds: int
    # Whether the stay cleared the class's minimum.
    attended: bool


class SessionAttendance(BaseDocument):
    session_id: uuid.UUID
    student_id: uuid.UUID
    batch_id: uuid.UUID

    live: LivePresence | None = None
    # First time the recording was opened: in the Drive audit log, and from
    # the student's own link. Either counts - see resolve.
    recording_viewed_at: datetime | None = None
    recording_opened_at: datetime | None = None

    # A member of staff's answer: True present, False absent, None "let the
    # data decide". Wins over both of the above.
    override: bool | None = None
    override_at: datetime | None = None
    override_by: uuid.UUID | None = None
    override_by_name: str | None = Field(default=None, max_length=150)

    # What the student said when they were rung about missing the class. A
    # history, oldest first: a second call is a second answer.
    call_remarks: list[FollowUpRemark] = Field(default_factory=list)

    class Settings:
        name = "session_attendance"
        indexes = [
            IndexModel([("session_id", 1), ("student_id", 1)], unique=True, name="uq_session_attendance"),
            IndexModel([("student_id", 1)]),
            IndexModel([("batch_id", 1)]),
        ]


AttendedVia = Literal["live", "recording", "manual"]


def resolve(row: SessionAttendance | None, *, held: bool) -> tuple[bool | None, AttendedVia | None]:
    """(attended, how) for one student at one class.

    attended is None for a class that hasn't happened, unless somebody has
    said otherwise - nobody can have missed it yet. A recording counts the
    same as the live class: catching up on the recording is attending.
    """
    if row is not None and row.override is not None:
        return row.override, "manual"
    if row is not None and row.live is not None and row.live.attended:
        return True, "live"
    if row is not None and (row.recording_viewed_at or row.recording_opened_at):
        return True, "recording"
    if not held:
        return None, None
    return False, None
