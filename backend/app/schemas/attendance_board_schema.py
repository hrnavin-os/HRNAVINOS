"""Request/response DTOs for the induction Attendance board."""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.foundation_group_schema import FoundationGroupMoveSchema

# The board's four tabs. Each is one yes/no marker against the induction roll;
# the values are the API's names for them, and the registry in
# app/services/attendance_board_service.py is what each one means in storage.
MarkerKey = Literal["terms", "polls", "success_meet", "foundation_class"]

# Which side of a marker a request wants: the whole roll, or one side of the
# split. "yes" and "no" partition "all", so their counts always add back up.
MarkerState = Literal["all", "yes", "no"]

# Where a mark's value came from. "auto" is a marker the data already answers
# (a foundation class attended by anyone who reached the Foundation Form);
# "manual" is somebody's tick, which overrides it; "none" is nobody has said.
# "meet": read from the Google Meet audit log (see meet_attendance_service).
MarkSource = Literal["manual", "auto", "meet", "none"]

# On the Polls tab's "Not selected" side: the students nobody has followed up
# yet, or the ones somebody has.
FollowUpState = Literal["pending", "done"]


class TermsDocumentResponse(BaseModel):
    title: str
    body: str
    updated_at: datetime | None = None
    updated_by_name: str | None = None


class TermsDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20000)


class MarkUpdate(BaseModel):
    # Three-valued on purpose: null clears a manual tick, which is not the same
    # as marking "no" - on a marker with an automatic answer, clearing returns
    # the student to whatever the data says.
    marked: bool | None = None


class MarkResponse(BaseModel):
    marked: bool
    source: MarkSource
    at: datetime | None = None
    by_name: str | None = None
    # Set when source is "meet".
    meet_joined_at: datetime | None = None
    meet_left_at: datetime | None = None
    meet_duration_seconds: int | None = None


class FollowUpRemarkResponse(BaseModel):
    remark: str
    at: datetime
    by_name: str | None = None


class PollFollowUpCreate(BaseModel):
    """Why a student said they didn't select the poll."""

    remark: str = Field(min_length=2, max_length=1000)


class AttendanceStudentResponse(BaseModel):
    """One row of the board: who they are, and where they stand on all four
    markers.

    Every marker travels on every row, not just the open tab's, so the table
    can show the whole picture and switching tabs is not a new question about
    the same people.
    """

    id: uuid.UUID
    name: str
    phone: str
    email: str | None = None
    section: str | None = None
    batch: str | None = None
    # Which foundation class group this candidate is in, as recorded on their
    # induction entry. None until somebody says - see
    # app/utils/foundation_groups.py.
    foundation_group: int | None = None
    # And how they got there. Sent with the row because this board is the roll
    # somebody prints and calls from: a student moved since the last print is
    # exactly who that person needs to notice.
    foundation_group_history: list[FoundationGroupMoveSchema] = Field(default_factory=list)
    registration_date: date
    # Where this candidate is on the induction board (still in induction, moved
    # to Foundation, quit). Shown so the board reads without opening the other
    # one: chasing a signature from somebody who quit is wasted effort.
    status: str
    marks: dict[str, MarkResponse]
    # The section admins' follow-up calls on a student who hasn't selected the
    # poll, newest first.
    poll_follow_ups: list[FollowUpRemarkResponse] = Field(default_factory=list)


class MarkerStatsResponse(BaseModel):
    total: int
    yes: int
    no: int


class AttendanceStatsResponse(BaseModel):
    total: int
    # {marker key: its split}. All four in one response so every tab can show
    # its own count without a request each.
    markers: dict[str, MarkerStatsResponse]
    # Of the students not selected in the poll, how many a section admin has
    # followed up at least once.
    polls_followed_up: int = 0
