"""Success Meet and Foundation Class attendance, read from Google Meet.

WHERE THE DATA COMES FROM
-------------------------
The Admin SDK Reports API, application `meet`, event `call_ended`:

    GET https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet
        ?eventName=call_ended&startTime=...&endTime=...

One event is written each time somebody leaves a call. It carries
`identifier` (their email, phone number or device id), `identifier_type`,
`display_name`, `is_external`, `meeting_code` and `duration_seconds`; the
event's own time (`id.time`) is when they left, so they joined
`duration_seconds` before it. Somebody who dropped and rejoined leaves two
events, which are summed.

Why not the Meet REST API (meet.googleapis.com conferenceRecords): it names a
signed-in participant as `users/{id}`, not by email, and turning that into an
email through the People API is not available for people outside the domain -
which is every student. The audit log names them by email.

Needs a Google Workspace domain. The service account (GOOGLE_SERVICE_ACCOUNT_*)
signs in as GOOGLE_MEET_ADMIN_EMAIL through domain-wide delegation, with the
scope admin.reports.audit.readonly; the Reports API answers administrators
only. Meet audit events arrive within a couple of minutes of the call ending
and are kept for 6 months.

WHAT A SYNC WRITES
------------------
For one linked meeting (a MeetSession: marker + meeting code + day):

- one MeetParticipant per identifier, upserted, holding first join, last leave,
  total duration and whether that clears the meeting's minimum;
- on every matched student who attended, the marker's AttendanceMark with
  origin "meet" and those times - unless the mark holds a manual answer. The
  guard is in the update's own filter, so a coordinator's correction saved a
  moment before the write still wins;
- nothing on students who were not in the call: absent is "nobody has said",
  not "no".

The whole day is re-read every time and the rows are rebuilt from it, so a sync
is idempotent and running it twice changes nothing.
"""
import asyncio
import logging
import random
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

import httpx
from jose import jwt
from pymongo.errors import DuplicateKeyError

from app.config.settings import settings
from app.database.base import utcnow
from app.models.induction_entry import AttendanceMark, InductionEntry
from app.models.meet_session import MeetParticipant, MeetSession
from app.services.google_sheets_client import SheetsError, _service_account_info
from app.utils.phone import normalize_phone

logger = logging.getLogger(__name__)

REPORTS_URL = "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet"
REPORTS_SCOPE = "https://www.googleapis.com/auth/admin.reports.audit.readonly"
TOKEN_URL = "https://oauth2.googleapis.com/token"
TIMEOUT_SECONDS = 20.0

# The stored attendance field behind each marker this can fill.
MARK_FIELDS = {
    "success_meet": "success_meet_attended",
    "foundation_class": "foundation_class_attended",
}


class MeetSyncError(Exception):
    """A failure talking to Google, worded for the sync panel."""


def normalize_meeting_code(value: str) -> str | None:
    """"abc-defg-hij", "ABCDEFGHIJ" or a full meet.google.com link -> "abcdefghij".

    None for anything that isn't a Meet code: ten letters, as Meet issues them.
    """
    text = value.strip()
    link = re.search(r"meet\.google\.com/([a-zA-Z-]+)", text)
    if link:
        text = link.group(1)
    letters = re.sub(r"[^a-zA-Z]", "", text).lower()
    return letters if re.fullmatch(r"[a-z]{10}", letters) else None


def format_meeting_code(code: str) -> str:
    """"abcdefghij" -> "abc-defg-hij", as Meet prints it."""
    return f"{code[:3]}-{code[3:7]}-{code[7:]}" if len(code) == 10 else code


def day_window(held_on: date) -> tuple[datetime, datetime]:
    """The day a meeting was held, as UTC instants, in the institute's zone."""
    offset = timezone(timedelta(minutes=settings.MEET_UTC_OFFSET_MINUTES))
    start = datetime(held_on.year, held_on.month, held_on.day, tzinfo=offset)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------

_cached_token: tuple[str, float] | None = None


async def _access_token(http: httpx.AsyncClient) -> str:
    """A token for the Reports API, as GOOGLE_MEET_ADMIN_EMAIL.

    The same JWT-bearer grant the Sheets client makes, with `sub` added: that
    is domain-wide delegation, the service account acting as the admin.
    """
    global _cached_token
    if _cached_token and _cached_token[1] > time.time() + 60:
        return _cached_token[0]
    try:
        info = _service_account_info()
    except SheetsError as exc:
        raise MeetSyncError(str(exc)) from exc
    if not info or not settings.GOOGLE_MEET_ADMIN_EMAIL:
        raise MeetSyncError(
            "Google Meet sync isn't set up: the server needs a Google service account and "
            "GOOGLE_MEET_ADMIN_EMAIL."
        )
    now = int(time.time())
    token_uri = info.get("token_uri") or TOKEN_URL
    assertion = jwt.encode(
        {
            "iss": info["client_email"],
            "sub": settings.GOOGLE_MEET_ADMIN_EMAIL,
            "scope": REPORTS_SCOPE,
            "aud": token_uri,
            "iat": now,
            "exp": now + 3600,
        },
        info["private_key"],
        algorithm="RS256",
        headers={"kid": info.get("private_key_id")} if info.get("private_key_id") else None,
    )
    response = await http.post(
        token_uri, data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
    )
    if response.status_code != 200:
        detail = response.text[:300]
        if "unauthorized_client" in detail:
            raise MeetSyncError(
                "Google refused the delegation. In the Admin console (Security > API controls > Domain-wide "
                f"delegation) allow the service account's client ID the scope {REPORTS_SCOPE}."
            )
        raise MeetSyncError(f"Google refused the service account credentials: {detail}")
    data = response.json()
    _cached_token = (data["access_token"], time.time() + data.get("expires_in", 3600))
    return data["access_token"]


def _parameters(event: dict) -> dict:
    """The event's parameter list as {name: value}, whichever typed slot
    (`value`, `intValue`, `boolValue`) Google put the value in."""
    values = {}
    for parameter in event.get("parameters", []):
        for slot in ("value", "intValue", "boolValue"):
            if slot in parameter:
                values[parameter["name"]] = parameter[slot]
                break
    return values


async def fetch_call_ended(http: httpx.AsyncClient, start: datetime, end: datetime) -> list[dict]:
    """Every `call_ended` event in [start, end), all pages."""
    token = await _access_token(http)
    params = {
        "eventName": "call_ended",
        "startTime": start.isoformat().replace("+00:00", "Z"),
        "endTime": end.isoformat().replace("+00:00", "Z"),
        "maxResults": 1000,
    }
    items: list[dict] = []
    while True:
        response = await http.get(REPORTS_URL, params=params, headers={"Authorization": f"Bearer {token}"})
        if response.status_code == 403:
            raise MeetSyncError(
                f"Google denied the audit log to {settings.GOOGLE_MEET_ADMIN_EMAIL}. It must be a Workspace "
                f"administrator allowed to view reports. ({response.text[:200]})"
            )
        if response.status_code != 200:
            raise MeetSyncError(f"Google Reports API failed (HTTP {response.status_code}): {response.text[:300]}")
        data = response.json()
        items.extend(data.get("items", []))
        if not data.get("nextPageToken"):
            return items
        params["pageToken"] = data["nextPageToken"]


# ---------------------------------------------------------------------------
# Rolling events up into participants
# ---------------------------------------------------------------------------


@dataclass
class Presence:
    identifier: str
    identifier_type: str | None
    display_name: str | None
    is_external: bool | None
    joined_at: datetime
    left_at: datetime
    duration_seconds: int = 0
    seen: set = field(default_factory=set)


def _identifier(values: dict) -> tuple[str, str | None] | None:
    raw = (values.get("identifier") or "").strip()
    kind = values.get("identifier_type")
    if not raw:
        return None
    if kind == "phone_number":
        return normalize_phone(raw) or raw, kind
    if kind == "email_address" or "@" in raw:
        return raw.lower(), kind or "email_address"
    return raw, kind


def roll_up(items: list[dict], meeting_code: str) -> dict[str, Presence]:
    """This meeting's events, one Presence per participant.

    Deduplicated on the event's uniqueQualifier: Google can return the same
    event on two overlapping pages, and counting it twice would double a stay.
    """
    people: dict[str, Presence] = {}
    for item in items:
        qualifier = (item.get("id") or {}).get("uniqueQualifier")
        left_raw = (item.get("id") or {}).get("time")
        if not left_raw:
            continue
        left_at = datetime.fromisoformat(left_raw.replace("Z", "+00:00"))
        for event in item.get("events", []):
            if event.get("name") != "call_ended":
                continue
            values = _parameters(event)
            if normalize_meeting_code(str(values.get("meeting_code", ""))) != meeting_code:
                continue
            who = _identifier(values)
            if who is None:
                continue
            key, kind = who
            duration = int(values.get("duration_seconds") or 0)
            joined_at = left_at - timedelta(seconds=duration)
            person = people.get(key)
            if person is None:
                person = people[key] = Presence(
                    identifier=key,
                    identifier_type=kind,
                    display_name=values.get("display_name"),
                    is_external=values.get("is_external"),
                    joined_at=joined_at,
                    left_at=left_at,
                )
            if qualifier and qualifier in person.seen:
                continue
            if qualifier:
                person.seen.add(qualifier)
            person.duration_seconds += duration
            person.joined_at = min(person.joined_at, joined_at)
            person.left_at = max(person.left_at, left_at)
            person.display_name = person.display_name or values.get("display_name")
    return people


async def _match(presence: Presence) -> list[InductionEntry]:
    """The induction entries a participant is: by email, or by phone for a
    dial-in. Case-insensitive on email - students type theirs in any case."""
    if presence.identifier_type == "phone_number":
        return await InductionEntry.find({"is_deleted": False, "phone_normalized": presence.identifier}).to_list()
    if "@" not in presence.identifier:
        return []
    pattern = f"^{re.escape(presence.identifier)}$"
    return await InductionEntry.find(
        {"is_deleted": False, "email": {"$regex": pattern, "$options": "i"}}
    ).to_list()


def _meet_may_write(path: str) -> dict:
    """The filter that lets the sync touch a mark: nobody has answered it, or
    the answer is the sync's own. A manual answer - origin "manual", or any
    answer written before origin existed - is never overwritten."""
    return {"$or": [{f"{path}.marked": {"$eq": None}}, {f"{path}.origin": "meet"}]}


# ---------------------------------------------------------------------------
# The sync
# ---------------------------------------------------------------------------


class MeetAttendanceService:
    async def sync(self, session: MeetSession, *, http: httpx.AsyncClient | None = None) -> MeetSession:
        """Re-reads one linked meeting's day from the audit log and applies it."""
        owns_client = http is None
        http = http or httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
        try:
            start, end = day_window(session.held_on)
            end = min(end, utcnow())
            items = await fetch_call_ended(http, start, end) if end > start else []
        except (MeetSyncError, httpx.HTTPError) as exc:
            session.last_sync_error = str(exc)[:500]
            session.last_synced_at = utcnow()
            await session.save()
            raise MeetSyncError(str(exc)) from exc
        finally:
            if owns_client:
                await http.aclose()

        await self.apply(session, roll_up(items, session.meeting_code))
        return session

    async def apply(self, session: MeetSession, people: dict[str, Presence]) -> None:
        path = f"attendance.{MARK_FIELDS[session.marker]}"
        minimum = session.min_minutes * 60
        attended = too_short = unmatched = 0

        for presence in people.values():
            status = "attended" if presence.duration_seconds >= minimum else "too_short"
            entries = await _match(presence)
            await MeetParticipant.get_motor_collection().update_one(
                {"meet_session_id": session.id, "identifier": presence.identifier},
                {
                    "$set": {
                        "marker": session.marker,
                        "identifier_type": presence.identifier_type,
                        "display_name": presence.display_name,
                        "is_external": presence.is_external,
                        "joined_at": presence.joined_at,
                        "left_at": presence.left_at,
                        "duration_seconds": presence.duration_seconds,
                        "status": status,
                        "induction_entry_ids": [entry.id for entry in entries],
                        "updated_at": utcnow(),
                    },
                    "$setOnInsert": {"_id": uuid.uuid4(), "created_at": utcnow(), "is_deleted": False},
                },
                upsert=True,
            )
            if not entries:
                unmatched += 1
                continue
            if status == "too_short":
                too_short += 1
                continue
            attended += 1
            mark = AttendanceMark(
                marked=True,
                at=presence.left_at,
                origin="meet",
                meet_session_id=session.id,
                meet_joined_at=presence.joined_at,
                meet_left_at=presence.left_at,
                meet_duration_seconds=presence.duration_seconds,
            ).model_dump()
            for entry in entries:
                await InductionEntry.get_motor_collection().update_one(
                    {"_id": entry.id, **_meet_may_write(path)}, {"$set": {path: mark, "updated_at": utcnow()}}
                )

        session.attended_count = attended
        session.too_short_count = too_short
        session.unmatched_count = unmatched
        session.last_synced_at = utcnow()
        session.last_sync_error = None
        await session.save()

    async def unlink(self, session: MeetSession) -> None:
        """Removes a linked meeting and every mark it wrote. Marks somebody has
        since corrected by hand are theirs and stay."""
        path = f"attendance.{MARK_FIELDS[session.marker]}"
        await InductionEntry.get_motor_collection().update_many(
            {f"{path}.origin": "meet", f"{path}.meet_session_id": session.id},
            {"$set": {path: AttendanceMark().model_dump(), "updated_at": utcnow()}},
        )
        await MeetParticipant.get_motor_collection().delete_many({"meet_session_id": session.id})
        await session.delete()

    async def sync_recent(self) -> int:
        """Every linked meeting held in the last MEET_AUTO_SYNC_DAYS days, up to
        today. Errors are recorded on the meeting and do not stop the rest."""
        today = (utcnow() + timedelta(minutes=settings.MEET_UTC_OFFSET_MINUTES)).date()
        since = today - timedelta(days=settings.MEET_AUTO_SYNC_DAYS)
        # held_on is stored as midnight of the day, which is what these compare to.
        sessions = await MeetSession.find(
            {
                "held_on": {
                    "$gte": datetime.combine(since, datetime.min.time()),
                    "$lte": datetime.combine(today, datetime.min.time()),
                }
            }
        ).to_list()
        synced = 0
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as http:
            for session in sessions:
                try:
                    await self.sync(session, http=http)
                    synced += 1
                except MeetSyncError as exc:
                    logger.warning("meet_sync_failed", extra={"session": str(session.id), "error": str(exc)})
        return synced


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

LEASE_ID = "meet_attendance_sync"


async def _take_lease() -> bool:
    """One worker syncs per interval; the others find the lease taken."""
    collection = MeetSession.get_motor_collection().database["job_leases"]
    now = utcnow()
    until = now + timedelta(minutes=settings.MEET_SYNC_INTERVAL_MINUTES)
    try:
        # Matches only an expired lease. A held one doesn't match, so the
        # upsert tries to insert a second document with the same _id - which
        # is the duplicate-key error that tells this worker to stand down.
        await collection.update_one(
            {"_id": LEASE_ID, "$or": [{"until": {"$lte": now}}, {"until": {"$exists": False}}]},
            {"$set": {"until": until}},
            upsert=True,
        )
    except DuplicateKeyError:
        return False
    return True


async def run_forever() -> None:
    """The per-worker loop started from the app lifespan. Does nothing until
    the server is configured for it."""
    await asyncio.sleep(random.uniform(5, 30))
    while True:
        try:
            if settings.meet_sync_configured and await _take_lease():
                await MeetAttendanceService().sync_recent()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("meet_sync_loop_error")
        await asyncio.sleep(settings.MEET_SYNC_INTERVAL_MINUTES * 60)
