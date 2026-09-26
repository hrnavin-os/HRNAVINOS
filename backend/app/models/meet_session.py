"""Google Meet meetings linked to an attendance marker, and who was in them.

A MeetSession says "the meeting with this code, held on this day, was the
Success Meet (or a Foundation Class)". The day matters because the institute
reuses one Meet link for every class; the code alone would pour a month of
classes into one row.

A MeetParticipant is one person's rolled-up presence in one linked meeting,
read from the Workspace Meet audit log - one row per (meeting, participant),
enforced by a unique index, so a re-sync updates the row it wrote last time
rather than adding another.
"""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field
from pymongo import IndexModel

from app.database.base import BaseDocument

MeetMarker = Literal["success_meet", "foundation_class"]


class MeetSession(BaseDocument):
    marker: MeetMarker
    # Lower-case letters only ("abcdefghij"): the audit log and a pasted link
    # write the same code with different case and hyphens.
    meeting_code: str = Field(max_length=32)
    held_on: date
    title: str | None = Field(default=None, max_length=150)
    # Less time than this in the call reads as "joined, but too briefly to
    # count" - recorded, but not marked attended. 0 counts any join.
    min_minutes: int = Field(default=0, ge=0, le=600)

    last_synced_at: datetime | None = None
    last_sync_error: str | None = Field(default=None, max_length=500)
    attended_count: int = 0
    too_short_count: int = 0
    unmatched_count: int = 0

    class Settings:
        name = "meet_sessions"
        indexes = [
            IndexModel([("marker", 1), ("meeting_code", 1), ("held_on", 1)], unique=True),
            IndexModel([("held_on", -1)]),
        ]


class MeetParticipant(BaseDocument):
    meet_session_id: uuid.UUID
    marker: MeetMarker
    # The audit log's participant identifier: an email (lower-cased), a phone
    # number (normalized), or a device id for a room system.
    identifier: str = Field(max_length=255)
    identifier_type: str | None = Field(default=None, max_length=32)
    display_name: str | None = Field(default=None, max_length=255)
    is_external: bool | None = None

    joined_at: datetime
    left_at: datetime
    duration_seconds: int
    status: Literal["attended", "too_short"]
    # The induction entries this participant was matched to. Empty is an
    # unmatched participant - shown on its own list, and re-matched on every
    # sync, so correcting a student's email picks them up next time.
    induction_entry_ids: list[uuid.UUID] = Field(default_factory=list)

    class Settings:
        name = "meet_participants"
        indexes = [
            IndexModel([("meet_session_id", 1), ("identifier", 1)], unique=True),
        ]
