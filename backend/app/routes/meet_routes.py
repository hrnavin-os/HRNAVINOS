"""Google Meet meetings linked to the Success Meet and Foundation Class pages.

Link a meeting (its code and the day it was held) to a marker, and its
attendance is read from the Workspace Meet audit log - automatically for a few
days after, or now on request. See app/services/meet_attendance_service.py.
"""
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from app.config.settings import settings
from app.core.dependencies import RequirePermissions, get_actor_scope, get_current_user
from app.exceptions.base import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.induction_entry import InductionEntry
from app.models.meet_session import MeetMarker, MeetParticipant, MeetSession
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse
from app.services.google_sheets_client import service_account_email
from app.services.meet_attendance_service import (
    MeetAttendanceService,
    MeetSyncError,
    format_meeting_code,
    normalize_meeting_code,
)


async def _whole_roll(actor: User = Depends(get_current_user)) -> None:
    """A meeting covers every section's students, so a Section Admin - who
    only ever sees their own - can't link or read one."""
    if await get_actor_scope(actor) is not None:
        raise ForbiddenError("Google Meet attendance covers every section, so it isn't open to a Section Admin.")


router = APIRouter(
    prefix="/induction-attendance/meet-sessions",
    tags=["Google Meet attendance"],
    dependencies=[Depends(_whole_roll)],
)


class MeetStatusResponse(BaseModel):
    configured: bool
    # What an admin needs to finish the setup, shown when not configured.
    service_account_email: str | None = None
    admin_email: str | None = None


class MeetSessionCreate(BaseModel):
    marker: MeetMarker
    # A code ("abc-defg-hij") or the whole meet.google.com link.
    meeting: str = Field(min_length=10, max_length=300)
    held_on: date
    title: str | None = Field(default=None, max_length=150)
    min_minutes: int = Field(default=0, ge=0, le=600)


class MeetSessionResponse(BaseModel):
    id: uuid.UUID
    marker: MeetMarker
    meeting_code: str
    held_on: date
    title: str | None
    min_minutes: int
    last_synced_at: datetime | None
    last_sync_error: str | None
    attended_count: int
    too_short_count: int
    unmatched_count: int


class MeetParticipantResponse(BaseModel):
    identifier: str
    identifier_type: str | None
    display_name: str | None
    is_external: bool | None
    joined_at: datetime
    left_at: datetime
    duration_seconds: int
    status: str
    # Names of the students matched, for the list; empty when unmatched.
    matched_names: list[str]


def _to_response(session: MeetSession) -> MeetSessionResponse:
    return MeetSessionResponse(
        **session.model_dump(include=set(MeetSessionResponse.model_fields) - {"meeting_code"}),
        meeting_code=format_meeting_code(session.meeting_code),
    )


async def _session(session_id: uuid.UUID) -> MeetSession:
    session = await MeetSession.get(session_id)
    if not session:
        raise NotFoundError("Linked meeting not found.")
    return session


@router.get("/status", response_model=MeetStatusResponse)
async def meet_status(
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> MeetStatusResponse:
    return MeetStatusResponse(
        configured=settings.meet_sync_configured,
        service_account_email=service_account_email(),
        admin_email=settings.GOOGLE_MEET_ADMIN_EMAIL,
    )


@router.get("", response_model=list[MeetSessionResponse])
async def list_meet_sessions(
    marker: MeetMarker,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> list[MeetSessionResponse]:
    sessions = await MeetSession.find({"marker": marker}).sort("-held_on").to_list()
    return [_to_response(session) for session in sessions]


@router.post("", response_model=MeetSessionResponse, status_code=status.HTTP_201_CREATED)
async def link_meet_session(
    payload: MeetSessionCreate,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_MARK)),
) -> MeetSessionResponse:
    code = normalize_meeting_code(payload.meeting)
    if not code:
        raise BadRequestError("That isn't a Google Meet link or code - it looks like abc-defg-hij.")
    existing = await MeetSession.find_one(
        {"marker": payload.marker, "meeting_code": code, "held_on": datetime.combine(payload.held_on, datetime.min.time())}
    )
    if existing:
        raise ConflictError("That meeting is already linked for that day.")
    session = MeetSession(
        marker=payload.marker,
        meeting_code=code,
        held_on=payload.held_on,
        title=(payload.title or "").strip() or None,
        min_minutes=payload.min_minutes,
        created_by=actor.id,
    )
    await session.insert()
    # Read straight away when it can be: linking a meeting that already
    # happened should show its attendance now, not in fifteen minutes.
    if settings.meet_sync_configured:
        try:
            await MeetAttendanceService().sync(session)
        except MeetSyncError:
            pass  # recorded on the session, and shown beside it
    return _to_response(session)


@router.post("/{session_id}/sync", response_model=MeetSessionResponse)
async def sync_meet_session(
    session_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_MARK)),
) -> MeetSessionResponse:
    session = await _session(session_id)
    if not settings.meet_sync_configured:
        raise BadRequestError("Google Meet sync isn't set up on the server yet.")
    try:
        await MeetAttendanceService().sync(session)
    except MeetSyncError as exc:
        raise BadRequestError(str(exc)) from exc
    return _to_response(session)


@router.delete("/{session_id}", response_model=MessageResponse)
async def unlink_meet_session(
    session_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_MARK)),
) -> MessageResponse:
    await MeetAttendanceService().unlink(await _session(session_id))
    return MessageResponse(message="Meeting unlinked, and the attendance it marked removed.")


@router.get("/{session_id}/participants", response_model=list[MeetParticipantResponse])
async def list_meet_participants(
    session_id: uuid.UUID,
    matched: bool | None = Query(default=None),
    actor: User = Depends(RequirePermissions(Permissions.INDUCTION_ATTENDANCE_VIEW)),
) -> list[MeetParticipantResponse]:
    """Who was in the call. `matched=false` is the unmatched list: people the
    audit log saw whose email or phone is on no student."""
    session = await _session(session_id)
    query: dict = {"meet_session_id": session.id}
    if matched is True:
        query["induction_entry_ids.0"] = {"$exists": True}
    elif matched is False:
        query["induction_entry_ids.0"] = {"$exists": False}
    participants = await MeetParticipant.find(query).sort("-duration_seconds").to_list()
    ids = {entry_id for participant in participants for entry_id in participant.induction_entry_ids}
    names = {
        entry.id: entry.name for entry in await InductionEntry.find({"_id": {"$in": list(ids)}}).to_list()
    } if ids else {}
    return [
        MeetParticipantResponse(
            identifier=participant.identifier,
            identifier_type=participant.identifier_type,
            display_name=participant.display_name,
            is_external=participant.is_external,
            joined_at=participant.joined_at,
            left_at=participant.left_at,
            duration_seconds=participant.duration_seconds,
            status=participant.status,
            matched_names=[names[entry_id] for entry_id in participant.induction_entry_ids if entry_id in names],
        )
        for participant in participants
    ]
