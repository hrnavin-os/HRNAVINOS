"""Success Meet / Foundation Class attendance from the Google Meet audit log.

Google is not called: the audit log's `call_ended` events are fed in as the
Reports API returns them (activities.list items), so what is tested is the
rolling-up, the matching and - above all - that a manual answer survives."""
from datetime import date, datetime, timedelta, timezone

from app.core.security import hash_password
from app.models.induction_entry import AttendanceMark, InductionEntry
from app.models.meet_session import MeetParticipant, MeetSession
from app.models.role import Role
from app.models.user import User
from app.services import meet_attendance_service as meet
from app.services.meet_attendance_service import MeetAttendanceService, normalize_meeting_code, roll_up

CODE = "abcdefghij"
LEFT = datetime(2026, 9, 20, 11, 0, tzinfo=timezone.utc)
STUDENTS_URL = "/api/v1/induction-attendance/students"
SESSIONS_URL = "/api/v1/induction-attendance/meet-sessions"


def call_ended(identifier, seconds, *, left=LEFT, code="ABC-DEFG-HIJ", qualifier=None, kind="email_address"):
    """One activities.list item, shaped as the Reports API returns it."""
    return {
        "id": {"time": left.isoformat().replace("+00:00", "Z"), "uniqueQualifier": qualifier or f"{identifier}{left}"},
        "events": [
            {
                "type": "call",
                "name": "call_ended",
                "parameters": [
                    {"name": "meeting_code", "value": code},
                    {"name": "identifier", "value": identifier},
                    {"name": "identifier_type", "value": kind},
                    {"name": "display_name", "value": identifier.split("@")[0]},
                    {"name": "duration_seconds", "intValue": str(seconds)},
                    {"name": "is_external", "boolValue": True},
                ],
            }
        ],
    }


async def student(name, email, phone, **attendance) -> InductionEntry:
    entry = InductionEntry(
        name=name, email=email, phone=phone, phone_normalized=phone, registration_date=date(2026, 9, 1)
    )
    for field, mark in attendance.items():
        setattr(entry.attendance, field, mark)
    await entry.insert()
    return entry


async def linked(marker="success_meet", min_minutes=0) -> MeetSession:
    session = MeetSession(marker=marker, meeting_code=CODE, held_on=date(2026, 9, 20), min_minutes=min_minutes)
    await session.insert()
    return session


def test_a_meeting_code_is_read_from_a_link_or_a_code():
    assert normalize_meeting_code("https://meet.google.com/abc-defg-hij?authuser=0") == CODE
    assert normalize_meeting_code("ABC-DEFG-HIJ") == CODE
    assert normalize_meeting_code("abcdefghij") == CODE
    assert normalize_meeting_code("not a meeting") is None


def test_rejoins_are_summed_and_repeated_events_counted_once():
    items = [
        call_ended("Arun@Mail.com", 600, left=LEFT - timedelta(minutes=30), qualifier="1"),
        call_ended("arun@mail.com", 1200, qualifier="2"),
        call_ended("arun@mail.com", 1200, qualifier="2"),  # the same event on two pages
        call_ended("bala@mail.com", 300, code="xyz-abcd-efg"),  # another meeting
    ]
    people = roll_up(items, CODE)

    assert list(people) == ["arun@mail.com"]
    arun = people["arun@mail.com"]
    assert arun.duration_seconds == 1800
    assert arun.joined_at == LEFT - timedelta(minutes=40)
    assert arun.left_at == LEFT


async def test_a_sync_marks_attendance_and_keeps_manual_corrections(client):
    attended = await student("Arun", "arun@mail.com", "9000000001")
    corrected = await student(
        "Bala", "bala@mail.com", "9000000002",
        success_meet_attended=AttendanceMark(marked=False, at=LEFT, origin="manual"),
    )
    # Marked by hand before `origin` existed - still somebody's answer.
    legacy = await student(
        "Chitra", "chitra@mail.com", "9000000003", success_meet_attended=AttendanceMark(marked=True, at=LEFT)
    )
    absent = await student("Dev", "dev@mail.com", "9000000004")
    session = await linked()

    items = [
        call_ended("ARUN@mail.com", 2700),
        call_ended("bala@mail.com", 2700),
        call_ended("chitra@mail.com", 60),
        call_ended("stranger@gmail.com", 900),
    ]
    service = MeetAttendanceService()
    await service.apply(session, roll_up(items, CODE))

    arun = (await InductionEntry.get(attended.id)).attendance.success_meet_attended
    assert arun.marked is True and arun.origin == "meet"
    assert arun.meet_duration_seconds == 2700
    assert arun.meet_joined_at == LEFT - timedelta(seconds=2700)
    assert (await InductionEntry.get(corrected.id)).attendance.success_meet_attended.marked is False
    chitra = (await InductionEntry.get(legacy.id)).attendance.success_meet_attended
    assert chitra.marked is True and chitra.origin is None
    # Not in the call: nobody has said, which is not "no".
    assert (await InductionEntry.get(absent.id)).attendance.success_meet_attended.marked is None

    # What Meet saw, whatever a correction says: three matched students were in the call.
    assert session.attended_count == 3
    assert session.unmatched_count == 1
    stranger = await MeetParticipant.find_one({"identifier": "stranger@gmail.com"})
    assert stranger.induction_entry_ids == []

    # Re-syncing the same day changes nothing and adds no rows.
    await service.apply(session, roll_up(items, CODE))
    assert await MeetParticipant.find({"meet_session_id": session.id}).count() == 4


async def test_a_stay_below_the_minimum_is_recorded_but_not_marked(client):
    entry = await student("Arun", "arun@mail.com", "9000000001")
    session = await linked(min_minutes=30)

    await MeetAttendanceService().apply(session, roll_up([call_ended("arun@mail.com", 600)], CODE))

    assert (await InductionEntry.get(entry.id)).attendance.success_meet_attended.marked is None
    participant = await MeetParticipant.find_one({"identifier": "arun@mail.com"})
    assert participant.status == "too_short" and participant.duration_seconds == 600


async def test_a_phone_dial_in_is_matched_on_the_number(client):
    entry = await student("Arun", None, "9876543210")
    session = await linked("foundation_class")

    await MeetAttendanceService().apply(
        session, roll_up([call_ended("+91 98765 43210", 1800, kind="phone_number")], CODE)
    )

    mark = (await InductionEntry.get(entry.id)).attendance.foundation_class_attended
    assert mark.marked is True and mark.origin == "meet"


async def test_the_board_shows_meet_attendance_and_a_correction_sticks(client, auth_headers):
    entry = await student("Arun", "arun@mail.com", "9000000001")
    session = await linked()
    await MeetAttendanceService().apply(session, roll_up([call_ended("arun@mail.com", 2700)], CODE))

    rows = (await client.get(STUDENTS_URL, headers=auth_headers, params={"marker": "success_meet"})).json()["items"]
    mark = next(row for row in rows if row["id"] == str(entry.id))["marks"]["success_meet"]
    assert mark["source"] == "meet" and mark["meet_duration_seconds"] == 2700

    # The coordinator says otherwise; the next sync leaves it alone.
    corrected = await client.put(
        f"{STUDENTS_URL}/{entry.id}/marks/success_meet", headers=auth_headers, json={"marked": False}
    )
    assert corrected.status_code == 200, corrected.text
    await MeetAttendanceService().apply(session, roll_up([call_ended("arun@mail.com", 2700)], CODE))
    stored = (await InductionEntry.get(entry.id)).attendance.success_meet_attended
    assert stored.marked is False and stored.origin == "manual"


async def test_linking_listing_and_unlinking_a_meeting(client, auth_headers, monkeypatch):
    entry = await student("Arun", "arun@mail.com", "9000000001")

    created = await client.post(
        SESSIONS_URL,
        headers=auth_headers,
        json={"marker": "success_meet", "meeting": "https://meet.google.com/abc-defg-hij", "held_on": "2026-09-20"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["meeting_code"] == "abc-defg-hij"
    duplicate = await client.post(
        SESSIONS_URL,
        headers=auth_headers,
        json={"marker": "success_meet", "meeting": "abc-defg-hij", "held_on": "2026-09-20"},
    )
    assert duplicate.status_code == 409

    session = await MeetSession.get(created.json()["id"])
    await MeetAttendanceService().apply(
        session, roll_up([call_ended("arun@mail.com", 2700), call_ended("who@gmail.com", 60)], CODE)
    )
    listed = (await client.get(SESSIONS_URL, headers=auth_headers, params={"marker": "success_meet"})).json()
    assert listed[0]["attended_count"] == 1 and listed[0]["unmatched_count"] == 1
    unmatched = (
        await client.get(f"{SESSIONS_URL}/{session.id}/participants", headers=auth_headers, params={"matched": False})
    ).json()
    assert [row["identifier"] for row in unmatched] == ["who@gmail.com"]

    # Unlinking takes back what it marked.
    assert (await client.delete(f"{SESSIONS_URL}/{session.id}", headers=auth_headers)).status_code == 200
    assert (await InductionEntry.get(entry.id)).attendance.success_meet_attended.marked is None
    assert await MeetParticipant.find({"meet_session_id": session.id}).count() == 0


async def test_sync_reads_the_meetings_day_from_google(client, monkeypatch):
    entry = await student("Arun", "arun@mail.com", "9000000001")
    session = await linked()
    windows = []

    async def fake_fetch(http, start, end):
        windows.append((start, end))
        return [call_ended("arun@mail.com", 2700)]

    monkeypatch.setattr(meet, "fetch_call_ended", fake_fetch)
    await MeetAttendanceService().sync(session)

    # 20 Sept in India: 19 Sept 18:30 UTC to 20 Sept 18:30 UTC.
    assert windows == [
        (datetime(2026, 9, 19, 18, 30, tzinfo=timezone.utc), datetime(2026, 9, 20, 18, 30, tzinfo=timezone.utc))
    ]
    assert (await InductionEntry.get(entry.id)).attendance.success_meet_attended.marked is True
    assert (await MeetSession.get(session.id)).last_synced_at is not None


async def test_a_section_admin_cannot_link_meetings(client, auth_headers):
    role = await Role.find_one({"scoped_section": "a", "is_deleted": False})
    await User(
        email="a.admin@example.com", first_name="A", last_name="Admin",
        password_hash=hash_password("Passw0rd!23"), role_id=role.id, is_active=True,
    ).insert()
    login = await client.post("/api/v1/auth/login", json={"email": "a.admin@example.com", "password": "Passw0rd!23"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await client.get(SESSIONS_URL, headers=headers, params={"marker": "success_meet"})
    assert response.status_code == 403
