"""Student Portal attendance, read from Google Workspace's audit logs.

Two sources, one per way of attending a class:

LIVE - the Meet audit log, exactly as the Success Meet sync reads it (see
meet_attendance_service.py for the event and why it is the audit log rather
than the Meet API). The class's day is re-read in full and every student's
`live` rebuilt from it, so a sync is idempotent.

RECORDING - the Drive audit log, application `drive`, event `view`, filtered to
the recording's file id:

    GET .../activity/users/all/applications/drive
        ?eventName=view&filters=doc_id==<file id>&startTime=...&endTime=...

Each event names its viewer in `actor.email`. Meet saves recordings into the
organiser's Drive, so they are files the domain owns, and views of them are
logged whoever the viewer is. Drive cannot say how much of a video somebody
watched, only that they opened it - so "viewed" is the strongest claim this
can make, and the staff override is there for everything it can't see.

A recording view only ever moves earlier: the Drive log is kept for six months,
and a sync after that must not undo what an earlier one found.

Participants are matched to the class's own batch only - by email, or by phone
for a dial-in. Anybody else is listed on the class as unmatched, which is
usually a student who joined from a different address.
"""
import asyncio
import logging
import random
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import httpx
from pymongo.errors import DuplicateKeyError

from app.config.settings import settings
from app.database.base import utcnow
from app.models.class_session import ClassSession, LivePresence, SessionAttendance, UnmatchedAttendee
from app.models.student import Student
from app.services import meet_attendance_service as meet
from app.services.meet_attendance_service import MeetSyncError, Presence, day_window, roll_up
from app.utils.phone import normalize_phone

logger = logging.getLogger(__name__)

# How long after a class its recording keeps being read. Students catch up on
# a recording for weeks, so this is far longer than the live window
# (MEET_AUTO_SYNC_DAYS), but stops well short of the Drive log's six months.
RECORDING_SYNC_DAYS = 60

# A class can be joined by anybody with the link. The list of people who
# weren't on the batch is for spotting students on a second email, not an
# audit of every visitor, so it is capped.
MAX_UNMATCHED = 100


def parse_drive_file_id(url: str | None) -> str | None:
    """The file id in a Drive share link, in any of the shapes Drive hands
    out (/file/d/<id>/view, open?id=<id>, uc?id=<id>). None for anything that
    isn't a Drive file link."""
    if not url or ("drive.google.com" not in url and "docs.google.com" not in url):
        return None
    match = re.search(r"/d/([A-Za-z0-9_-]{20,})", url) or re.search(r"[?&]id=([A-Za-z0-9_-]{20,})", url)
    return match.group(1) if match else None


def local_today() -> date:
    """Today in the institute's zone, which is the day classes are held on."""
    return (utcnow() + timedelta(minutes=settings.MEET_UTC_OFFSET_MINUTES)).date()


def first_views(items: list[dict], file_id: str) -> dict[str, datetime]:
    """Each viewer's earliest `view` of one file, by lower-cased email."""
    views: dict[str, datetime] = {}
    for item in items:
        email = ((item.get("actor") or {}).get("email") or "").strip().lower()
        when = (item.get("id") or {}).get("time")
        if not email or not when:
            continue
        at = datetime.fromisoformat(when.replace("Z", "+00:00"))
        for event in item.get("events", []):
            if event.get("name") != "view":
                continue
            if meet._parameters(event).get("doc_id") not in (None, file_id):
                continue
            if email not in views or at < views[email]:
                views[email] = at
    return views


# ---------------------------------------------------------------------------
# Matching against the batch
# ---------------------------------------------------------------------------


@dataclass
class Roster:
    by_email: dict[str, Student]
    by_phone: dict[str, Student]

    def match(self, presence: Presence) -> Student | None:
        if presence.identifier_type == "phone_number":
            return self.by_phone.get(presence.identifier)
        return self.by_email.get(presence.identifier.lower())


async def roster_for(batch_id: uuid.UUID) -> Roster:
    students = await Student.find({"batch_id": batch_id, "is_deleted": False}).to_list()
    return Roster(
        by_email={student.email.lower(): student for student in students if student.email},
        by_phone={phone: student for student in students if (phone := normalize_phone(student.phone))},
    )


async def ensure_row(session: ClassSession, student_id: uuid.UUID) -> None:
    """Creates the student's row for this class if there isn't one, leaving an
    existing row exactly as it is."""
    now = utcnow()
    try:
        await SessionAttendance.get_motor_collection().update_one(
            {"session_id": session.id, "student_id": student_id},
            {
                "$setOnInsert": {
                    "_id": uuid.uuid4(),
                    "batch_id": session.batch_id,
                    "call_remarks": [],
                    "created_at": now,
                    "updated_at": now,
                    "is_deleted": False,
                }
            },
            upsert=True,
        )
    except DuplicateKeyError:
        # Two syncs racing to create the same row: the other one won, and the
        # row this wanted now exists.
        pass


async def record_recording_view(
    session: ClassSession, student_id: uuid.UUID, at: datetime, *, field: str = "recording_viewed_at"
) -> None:
    """Sets the first-view time, unless an earlier one is already recorded.

    Not $min: BSON orders null before every date, so $min against a row that
    has never been viewed would keep the null."""
    await ensure_row(session, student_id)
    await SessionAttendance.get_motor_collection().update_one(
        {
            "session_id": session.id,
            "student_id": student_id,
            "$or": [{field: None}, {field: {"$gt": at}}],
        },
        {"$set": {field: at, "updated_at": utcnow()}},
    )


# ---------------------------------------------------------------------------
# The sync
# ---------------------------------------------------------------------------


class ClassAttendanceService:
    async def sync_live(self, session: ClassSession, *, http: httpx.AsyncClient | None = None) -> ClassSession:
        """Re-reads the class's day from the Meet audit log and applies it."""
        if not session.meeting_code:
            return session
        owns_client = http is None
        http = http or httpx.AsyncClient(timeout=meet.TIMEOUT_SECONDS)
        try:
            start, end = day_window(session.held_on)
            end = min(end, utcnow())
            items = await meet.fetch_call_ended(http, start, end) if end > start else []
        except (MeetSyncError, httpx.HTTPError) as exc:
            session.live_sync_error = str(exc)[:500]
            session.live_synced_at = utcnow()
            await session.save()
            raise MeetSyncError(str(exc)) from exc
        finally:
            if owns_client:
                await http.aclose()

        await self.apply_live(session, roll_up(items, session.meeting_code))
        return session

    async def apply_live(self, session: ClassSession, people: dict[str, Presence]) -> None:
        roster = await roster_for(session.batch_id)
        # A student can be in the call twice over - on the laptop by email and
        # dialled in from a phone - so stays are summed per student.
        stays: dict[uuid.UUID, Presence] = {}
        unmatched: list[UnmatchedAttendee] = []
        for presence in people.values():
            student = roster.match(presence)
            if student is None:
                unmatched.append(
                    UnmatchedAttendee(
                        identifier=presence.identifier,
                        display_name=presence.display_name,
                        duration_seconds=presence.duration_seconds,
                    )
                )
                continue
            stay = stays.get(student.id)
            if stay is None:
                stays[student.id] = Presence(
                    identifier=presence.identifier,
                    identifier_type=presence.identifier_type,
                    display_name=presence.display_name,
                    is_external=presence.is_external,
                    joined_at=presence.joined_at,
                    left_at=presence.left_at,
                    duration_seconds=presence.duration_seconds,
                )
            else:
                stay.duration_seconds += presence.duration_seconds
                stay.joined_at = min(stay.joined_at, presence.joined_at)
                stay.left_at = max(stay.left_at, presence.left_at)

        collection = SessionAttendance.get_motor_collection()
        minimum = session.min_minutes * 60
        for student_id, stay in stays.items():
            await ensure_row(session, student_id)
            live = LivePresence(
                joined_at=stay.joined_at,
                left_at=stay.left_at,
                duration_seconds=stay.duration_seconds,
                attended=stay.duration_seconds >= minimum,
            ).model_dump()
            await collection.update_one(
                {"session_id": session.id, "student_id": student_id},
                {"$set": {"live": live, "updated_at": utcnow()}},
            )
        # The day was re-read in full, so anybody it no longer puts in the call
        # wasn't in it - a student matched last time by an email since
        # corrected onto somebody else, say.
        await collection.update_many(
            {"session_id": session.id, "student_id": {"$nin": list(stays)}, "live": {"$ne": None}},
            {"$set": {"live": None, "updated_at": utcnow()}},
        )

        unmatched.sort(key=lambda attendee: -attendee.duration_seconds)
        session.unmatched = unmatched[:MAX_UNMATCHED]
        session.live_synced_at = utcnow()
        session.live_sync_error = None
        await session.save()

    async def sync_recording(self, session: ClassSession, *, http: httpx.AsyncClient | None = None) -> ClassSession:
        """Reads views of the class's recording from the Drive audit log."""
        if not session.recording_file_id:
            return session
        owns_client = http is None
        http = http or httpx.AsyncClient(timeout=meet.TIMEOUT_SECONDS)
        try:
            start, _ = day_window(session.held_on)
            end = utcnow()
            items = (
                await meet.fetch_activities(
                    http,
                    "drive",
                    event_name="view",
                    start=start,
                    end=end,
                    filters=f"doc_id=={session.recording_file_id}",
                )
                if end > start
                else []
            )
        except (MeetSyncError, httpx.HTTPError) as exc:
            session.recording_sync_error = str(exc)[:500]
            session.recording_synced_at = utcnow()
            await session.save()
            raise MeetSyncError(str(exc)) from exc
        finally:
            if owns_client:
                await http.aclose()

        await self.apply_recording_views(session, first_views(items, session.recording_file_id))
        return session

    async def apply_recording_views(self, session: ClassSession, views: dict[str, datetime]) -> None:
        roster = await roster_for(session.batch_id)
        for email, at in views.items():
            student = roster.by_email.get(email)
            if student is not None:
                await record_recording_view(session, student.id, at)
        session.recording_synced_at = utcnow()
        session.recording_sync_error = None
        await session.save()

    async def sync(self, session: ClassSession, *, http: httpx.AsyncClient | None = None) -> ClassSession:
        """Both halves. The live call is read even when the recording fails,
        and the other way round; the first error is raised after both ran."""
        error: MeetSyncError | None = None
        for step in (self.sync_live, self.sync_recording):
            try:
                await step(session, http=http)
            except MeetSyncError as exc:
                error = error or exc
        if error:
            raise error
        return session

    async def sync_recent(self) -> int:
        """Live attendance for classes in the last MEET_AUTO_SYNC_DAYS, and
        recording views for classes in the last RECORDING_SYNC_DAYS. Errors are
        recorded on the class and don't stop the rest."""
        today = local_today()
        live_since = today - timedelta(days=settings.MEET_AUTO_SYNC_DAYS)
        since = today - timedelta(days=RECORDING_SYNC_DAYS)
        # held_on is stored as midnight of the day, which is what these compare to.
        sessions = await ClassSession.find(
            {
                "is_deleted": False,
                "held_on": {
                    "$gte": datetime.combine(since, datetime.min.time()),
                    "$lte": datetime.combine(today, datetime.min.time()),
                },
            }
        ).to_list()
        synced = 0
        async with httpx.AsyncClient(timeout=meet.TIMEOUT_SECONDS) as http:
            for session in sessions:
                steps = [self.sync_recording]
                if session.held_on >= live_since:
                    steps.insert(0, self.sync_live)
                for step in steps:
                    try:
                        await step(session, http=http)
                    except MeetSyncError as exc:
                        logger.warning("class_sync_failed", extra={"session": str(session.id), "error": str(exc)})
                synced += 1
        return synced


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

LEASE_ID = "class_attendance_sync"


async def _take_lease() -> bool:
    """One worker syncs per interval; the others find the lease taken. The
    same lease document pattern as the Meet sync, under its own id."""
    collection = ClassSession.get_motor_collection().database["job_leases"]
    now = utcnow()
    until = now + timedelta(minutes=settings.MEET_SYNC_INTERVAL_MINUTES)
    try:
        await collection.update_one(
            {"_id": LEASE_ID, "$or": [{"until": {"$lte": now}}, {"until": {"$exists": False}}]},
            {"$set": {"until": until}},
            upsert=True,
        )
    except DuplicateKeyError:
        return False
    return True


async def run_forever() -> None:
    """The per-worker loop started from the app lifespan. Idles until the
    server has the Meet sync's credentials, which this shares."""
    await asyncio.sleep(random.uniform(5, 30))
    while True:
        try:
            if settings.meet_sync_configured and await _take_lease():
                await ClassAttendanceService().sync_recent()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("class_sync_loop_error")
        await asyncio.sleep(settings.MEET_SYNC_INTERVAL_MINUTES * 60)
