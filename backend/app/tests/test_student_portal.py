"""The Student Portal: classes, attendance from Meet and Drive, the terms gate
on a student's private link, and the attendance report.

Google is not called. Audit-log items are fed in as the Reports API returns
them, as in test_meet_attendance.py, so what is tested is the matching, the
rebuild rules, and that a person's answer survives every sync."""
from datetime import date, datetime, timedelta, timezone

from app.core.security import hash_password
from app.models.batch import Batch
from app.models.class_session import ClassSession, SessionAttendance
from app.models.course import Course
from app.models.enums import StudentStatus
from app.models.role import Role
from app.models.student import Student
from app.models.user import User
from app.services import class_attendance_service as classes
from app.services import meet_attendance_service as meet
from app.services.class_attendance_service import (
    ClassAttendanceService,
    first_views,
    local_today,
    parse_drive_file_id,
)
from app.services.meet_attendance_service import roll_up

PORTAL = "/api/v1/student-portal"
PUBLIC = "/api/v1/public/student-portal"
CODE = "abcdefghij"
DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"
DRIVE_LINK = f"https://drive.google.com/file/d/{DRIVE_ID}/view?usp=sharing"
LEFT = datetime(2026, 9, 20, 15, 0, tzinfo=timezone.utc)


def call_ended(identifier, seconds, *, left=LEFT, kind="email_address", qualifier=None):
    return {
        "id": {"time": left.isoformat().replace("+00:00", "Z"), "uniqueQualifier": qualifier or f"{identifier}{left}"},
        "events": [
            {
                "name": "call_ended",
                "parameters": [
                    {"name": "meeting_code", "value": "ABC-DEFG-HIJ"},
                    {"name": "identifier", "value": identifier},
                    {"name": "identifier_type", "value": kind},
                    {"name": "display_name", "value": identifier.split("@")[0]},
                    {"name": "duration_seconds", "intValue": str(seconds)},
                ],
            }
        ],
    }


def drive_view(email, at, *, doc_id=DRIVE_ID):
    return {
        "id": {"time": at.isoformat().replace("+00:00", "Z")},
        "actor": {"email": email},
        "events": [{"name": "view", "parameters": [{"name": "doc_id", "value": doc_id}]}],
    }


async def make_batch(name="Batch-7") -> Batch:
    course = Course(name="HR Generalist", code=f"HRG-{name}", duration_weeks=8, fee="15000")
    await course.insert()
    batch = Batch(course_id=course.id, name=name, start_date=date(2026, 9, 1), end_date=date(2026, 11, 1))
    await batch.insert()
    return batch


async def make_student(batch, first, email, phone=None, **fields) -> Student:
    student = Student(
        first_name=first,
        last_name="S",
        email=email,
        phone=phone,
        batch_id=batch.id,
        course_id=batch.course_id,
        admission_date=date(2026, 9, 1),
        **fields,
    )
    await student.insert()
    return student


async def make_class(batch, sequence=1, *, held_on=None, **fields) -> ClassSession:
    session = ClassSession(
        batch_id=batch.id,
        sequence=sequence,
        title=f"Class {sequence}",
        held_on=held_on or local_today() - timedelta(days=1),
        **fields,
    )
    await session.insert()
    return session


async def row(session, student) -> SessionAttendance | None:
    return await SessionAttendance.find_one({"session_id": session.id, "student_id": student.id})


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def test_a_drive_file_id_is_read_from_every_link_shape():
    assert parse_drive_file_id(DRIVE_LINK) == DRIVE_ID
    assert parse_drive_file_id(f"https://drive.google.com/open?id={DRIVE_ID}") == DRIVE_ID
    assert parse_drive_file_id(f"https://drive.google.com/uc?export=download&id={DRIVE_ID}") == DRIVE_ID
    assert parse_drive_file_id("https://youtu.be/abc") is None
    assert parse_drive_file_id(None) is None


def test_first_views_keeps_each_viewers_earliest_view_of_the_one_file():
    early, late = LEFT, LEFT + timedelta(days=2)
    views = first_views(
        [
            drive_view("Arun@Mail.com", late),
            drive_view("arun@mail.com", early),
            drive_view("bala@mail.com", late, doc_id="someOtherFile00000000000"),
        ],
        DRIVE_ID,
    )
    assert views == {"arun@mail.com": early}


# ---------------------------------------------------------------------------
# Live attendance
# ---------------------------------------------------------------------------


async def test_live_sync_matches_the_batch_by_email_and_phone(client):
    batch = await make_batch()
    other = await make_batch("Batch-8")
    arun = await make_student(batch, "Arun", "arun@mail.com")
    bala = await make_student(batch, "Bala", "bala@mail.com", phone="+91 98765 43210")
    chitra = await make_student(batch, "Chitra", "chitra@mail.com")
    outsider = await make_student(other, "Dev", "dev@mail.com")
    session = await make_class(batch, meeting_code=CODE, min_minutes=10)

    people = roll_up(
        [
            call_ended("arun@mail.com", 2400),
            call_ended("9876543210", 1800, kind="phone_number"),
            call_ended("chitra@mail.com", 120),  # under the minimum
            call_ended("dev@mail.com", 2400),  # another batch's student
            call_ended("stranger@gmail.com", 900),
        ],
        CODE,
    )
    await ClassAttendanceService().apply_live(session, people)

    assert (await row(session, arun)).live.attended is True
    assert (await row(session, bala)).live.attended is True
    chitra_row = await row(session, chitra)
    assert chitra_row.live.attended is False and chitra_row.live.duration_seconds == 120
    assert await row(session, outsider) is None
    stored = await ClassSession.get(session.id)
    assert sorted(attendee.identifier for attendee in stored.unmatched) == ["dev@mail.com", "stranger@gmail.com"]

    # Re-reading the day without Arun in it takes his presence back.
    await ClassAttendanceService().apply_live(session, roll_up([call_ended("bala@mail.com", 1800)], CODE))
    assert (await row(session, arun)).live is None


async def test_a_staff_answer_survives_every_sync(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    session = await make_class(batch, meeting_code=CODE)

    marked = await client.put(
        f"{PORTAL}/sessions/{session.id}/students/{arun.id}/attendance", headers=auth_headers, json={"attended": False}
    )
    assert marked.status_code == 200, marked.text
    await ClassAttendanceService().apply_live(session, roll_up([call_ended("arun@mail.com", 3600)], CODE))

    roll = (await client.get(f"{PORTAL}/sessions/{session.id}", headers=auth_headers)).json()
    arun_row = next(r for r in roll["rows"] if r["student_id"] == str(arun.id))
    assert arun_row["attended"] is False and arun_row["via"] == "manual"
    assert arun_row["live"]["attended"] is True  # the fact is kept beside the answer
    assert arun_row["override_by_name"]

    # Clearing the answer hands it back to the data.
    await client.put(
        f"{PORTAL}/sessions/{session.id}/students/{arun.id}/attendance", headers=auth_headers, json={"attended": None}
    )
    roll = (await client.get(f"{PORTAL}/sessions/{session.id}", headers=auth_headers)).json()
    arun_row = next(r for r in roll["rows"] if r["student_id"] == str(arun.id))
    assert arun_row["attended"] is True and arun_row["via"] == "live"


async def test_sync_live_reads_the_classs_day(client, monkeypatch):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    session = await make_class(batch, held_on=date(2026, 9, 20), meeting_code=CODE)
    windows = []

    async def fake_fetch(http, start, end):
        windows.append((start, end))
        return [call_ended("arun@mail.com", 2700)]

    monkeypatch.setattr(meet, "fetch_call_ended", fake_fetch)
    await ClassAttendanceService().sync_live(session)

    assert windows == [
        (datetime(2026, 9, 19, 18, 30, tzinfo=timezone.utc), datetime(2026, 9, 20, 18, 30, tzinfo=timezone.utc))
    ]
    assert (await row(session, arun)).live.attended is True


# ---------------------------------------------------------------------------
# Recording views
# ---------------------------------------------------------------------------


async def test_recording_views_count_and_only_ever_move_earlier(client, monkeypatch):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    session = await make_class(batch, recording_url=DRIVE_LINK, recording_file_id=DRIVE_ID)
    asked = []

    async def fake_activities(http, application, *, event_name, start, end, filters=None):
        asked.append((application, event_name, filters))
        return [drive_view("arun@mail.com", LEFT + timedelta(days=1)), drive_view("nobody@mail.com", LEFT)]

    monkeypatch.setattr(meet, "fetch_activities", fake_activities)
    await ClassAttendanceService().sync_recording(session)

    assert asked == [("drive", "view", f"doc_id=={DRIVE_ID}")]
    assert (await row(session, arun)).recording_viewed_at == (LEFT + timedelta(days=1))

    # A later sync that has forgotten the first view (or found a later one)
    # leaves the earliest in place.
    await ClassAttendanceService().apply_recording_views(session, {"arun@mail.com": LEFT + timedelta(days=5)})
    assert (await row(session, arun)).recording_viewed_at == (LEFT + timedelta(days=1))
    await ClassAttendanceService().apply_recording_views(session, {"arun@mail.com": LEFT})
    assert (await row(session, arun)).recording_viewed_at == LEFT


# ---------------------------------------------------------------------------
# The board
# ---------------------------------------------------------------------------


async def test_creating_classes_validates_links_and_sequence(client, auth_headers):
    batch = await make_batch()
    url = f"{PORTAL}/batches/{batch.id}/sessions"
    base = {"sequence": 1, "title": "Intro to HR", "held_on": str(local_today() + timedelta(days=2))}

    bad_meet = await client.post(url, headers=auth_headers, json={**base, "meeting": "not a meeting"})
    assert bad_meet.status_code == 400

    created = await client.post(
        url,
        headers=auth_headers,
        json={**base, "meeting": "https://meet.google.com/abc-defg-hij", "recording_url": DRIVE_LINK},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["meeting_code"] == "abc-defg-hij"
    assert body["meet_url"] == "https://meet.google.com/abc-defg-hij"
    assert body["recording_trackable"] is True
    assert body["held"] is False

    duplicate = await client.post(url, headers=auth_headers, json=base)
    assert duplicate.status_code == 409

    # Clearing the meeting takes the class off Meet.
    updated = await client.put(f"{PORTAL}/sessions/{body['id']}", headers=auth_headers, json={"meeting": ""})
    assert updated.status_code == 200
    assert updated.json()["meeting_code"] is None


async def test_pointing_a_class_at_another_meeting_or_file_drops_what_was_read(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    session = await make_class(batch, meeting_code=CODE, recording_url=DRIVE_LINK, recording_file_id=DRIVE_ID)
    await ClassAttendanceService().apply_live(session, roll_up([call_ended("arun@mail.com", 3600)], CODE))
    await classes.record_recording_view(session, arun.id, LEFT)
    url = f"{PORTAL}/sessions/{session.id}"

    # The same file under another link shape is the same recording.
    same_file = f"https://drive.google.com/open?id={DRIVE_ID}"
    assert (await client.put(url, headers=auth_headers, json={"recording_url": same_file})).status_code == 200
    assert (await row(session, arun)).recording_viewed_at is not None

    other_file = "https://drive.google.com/file/d/1ZzZzZzZzZzZzZzZzZzZzZzZzZzZzZz/view"
    assert (await client.put(url, headers=auth_headers, json={"recording_url": other_file})).status_code == 200
    assert (await row(session, arun)).recording_viewed_at is None
    assert (await row(session, arun)).live is not None  # the meeting didn't change

    assert (await client.put(url, headers=auth_headers, json={"meeting": "xyz-abcd-efg"})).status_code == 200
    assert (await row(session, arun)).live is None


async def test_the_roster_totals_count_only_classes_held(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    bala = await make_student(batch, "Bala", "bala@mail.com")
    gone = await make_student(batch, "Gone", "gone@mail.com", status=StudentStatus.DROPPED)
    today = local_today()
    first = await make_class(batch, 1, held_on=today - timedelta(days=7), meeting_code=CODE)
    second = await make_class(batch, 2, held_on=today - timedelta(days=1))
    await make_class(batch, 3, held_on=today + timedelta(days=6))

    await ClassAttendanceService().apply_live(first, roll_up([call_ended("arun@mail.com", 3600)], CODE))
    await classes.record_recording_view(second, bala.id, LEFT, field="recording_opened_at")

    roster = (await client.get(f"{PORTAL}/batches/{batch.id}", headers=auth_headers)).json()
    by_id = {student["id"]: student["totals"] for student in roster["students"]}
    assert by_id[str(arun.id)] == {"held": 2, "attended": 1, "percent": 50.0, "live": 1, "recording": 0, "manual": 0}
    assert by_id[str(bala.id)]["recording"] == 1
    sessions = {session["sequence"]: session for session in roster["sessions"]}
    # The dropped student isn't one of the first class's absentees.
    assert (sessions[1]["present_count"], sessions[1]["absent_count"]) == (1, 1)
    assert sessions[3]["held"] is False and sessions[3]["absent_count"] == 0
    assert str(gone.id) in by_id

    listed = (await client.get(f"{PORTAL}/batches", headers=auth_headers)).json()
    assert [entry["name"] for entry in listed] == ["Batch-7"]
    assert listed[0]["student_count"] == 3 and listed[0]["session_count"] == 3


async def test_absentee_call_remarks_are_kept_as_a_history(client, auth_headers):
    batch = await make_batch()
    other = await make_batch("Batch-8")
    arun = await make_student(batch, "Arun", "arun@mail.com")
    stranger = await make_student(other, "Dev", "dev@mail.com")
    session = await make_class(batch)
    url = f"{PORTAL}/sessions/{session.id}/students"

    for remark in ("Was travelling", "Will watch the recording tonight"):
        added = await client.post(f"{url}/{arun.id}/remarks", headers=auth_headers, json={"remark": remark})
        assert added.status_code == 201, added.text
    wrong_batch = await client.post(f"{url}/{stranger.id}/remarks", headers=auth_headers, json={"remark": "x"})
    assert wrong_batch.status_code == 400

    detail = (await client.get(f"{PORTAL}/students/{arun.id}", headers=auth_headers)).json()
    remarks = detail["sessions"][0]["call_remarks"]
    assert [entry["remark"] for entry in remarks] == ["Was travelling", "Will watch the recording tonight"]
    assert detail["sessions"][0]["attended"] is False


async def test_the_attendance_report_is_a_pdf(client, auth_headers):
    batch = await make_batch()
    await make_student(batch, "Arun", "arun@mail.com")
    await make_student(batch, "Chitrā", "chitra@mail.com")  # outside Latin-1 on purpose
    for sequence in range(1, 31):  # more classes than fit across one page
        await make_class(batch, sequence, held_on=local_today() - timedelta(days=40 - sequence))

    response = await client.get(f"{PORTAL}/batches/{batch.id}/attendance.pdf", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attendance-Batch-7-" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


# ---------------------------------------------------------------------------
# The student's private link
# ---------------------------------------------------------------------------


async def test_the_terms_come_before_anything_else_on_the_link(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    today = local_today()
    past = await make_class(batch, 1, held_on=today - timedelta(days=2), meeting_code=CODE, recording_url=DRIVE_LINK)
    await make_class(batch, 2, held_on=today + timedelta(days=1), meeting_code=CODE)

    link = await client.post(f"{PORTAL}/students/{arun.id}/link", headers=auth_headers)
    assert link.status_code == 200, link.text
    token = link.json()["portal_path"].removeprefix("/s/")
    # Asking again hands back the same link rather than revoking it.
    again = await client.post(f"{PORTAL}/students/{arun.id}/link", headers=auth_headers)
    assert again.json()["portal_path"] == link.json()["portal_path"]

    page = (await client.get(f"{PUBLIC}/{token}")).json()
    assert page["terms_signed"] is False and page["classes"] == []
    assert page["name"] == "Arun S"
    blocked = await client.post(f"{PUBLIC}/{token}/classes/{past.id}/recording")
    assert blocked.status_code == 403

    not_agreed = await client.post(f"{PUBLIC}/{token}/terms", data={"signed_name": "Arun S"})
    assert not_agreed.status_code == 400
    signed = await client.post(f"{PUBLIC}/{token}/terms", data={"signed_name": "Arun S", "agreed": "true"})
    assert signed.status_code == 200, signed.text
    page = signed.json()
    assert page["terms_signed"] is True
    by_sequence = {entry["sequence"]: entry for entry in page["classes"]}
    # The Meet link is for the class still to come; the past one is watched
    # from its recording.
    assert by_sequence[1]["meet_url"] is None and by_sequence[1]["has_recording"] is True
    assert by_sequence[2]["meet_url"] == "https://meet.google.com/abc-defg-hij"

    opened = await client.post(f"{PUBLIC}/{token}/classes/{past.id}/recording")
    assert opened.status_code == 200
    assert opened.json()["url"] == DRIVE_LINK
    assert (await row(past, arun)).recording_opened_at is not None
    assert (await client.get(f"{PUBLIC}/{token}")).json()["classes"][0]["watched"] is True

    stored = await Student.get(arun.id)
    assert stored.terms.source == "link" and stored.terms.signed_name == "Arun S"
    assert stored.terms.document_title == "Terms & Conditions"


async def test_a_regenerated_or_dropped_link_stops_working(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    first = (await client.post(f"{PORTAL}/students/{arun.id}/link", headers=auth_headers)).json()["portal_path"]
    second = (
        await client.post(f"{PORTAL}/students/{arun.id}/link", headers=auth_headers, params={"regenerate": True})
    ).json()["portal_path"]
    assert first != second
    assert (await client.get(f"{PUBLIC}/{first.removeprefix('/s/')}")).status_code == 404
    assert (await client.get(f"{PUBLIC}/{second.removeprefix('/s/')}")).status_code == 200

    await client.put(f"/api/v1/students/{arun.id}", headers=auth_headers, json={"status": "dropped"})
    assert (await client.get(f"{PUBLIC}/{second.removeprefix('/s/')}")).status_code == 404
    assert (await client.get(f"{PUBLIC}/not-a-real-token")).status_code == 404


async def test_staff_can_record_a_paper_signature_and_take_it_back(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")

    recorded = await client.post(
        f"{PORTAL}/students/{arun.id}/terms",
        headers=auth_headers,
        data={"signed_name": "Arun S"},
        files={"file": ("signed.pdf", b"%PDF-1.4 signed terms", "application/pdf")},
    )
    assert recorded.status_code == 200, recorded.text
    terms = recorded.json()["terms"]
    assert terms["source"] == "staff"
    assert terms["recorded_by_name"]
    assert terms["signed_copy_url"].startswith("/uploads/terms/") and terms["signed_copy_url"].endswith(".pdf")

    cleared = await client.delete(f"{PORTAL}/students/{arun.id}/terms", headers=auth_headers)
    assert cleared.status_code == 200
    assert cleared.json()["terms"] is None


# ---------------------------------------------------------------------------
# Who can use it
# ---------------------------------------------------------------------------


async def _login_as(client, role_name: str, email: str) -> dict:
    role = await Role.find_one({"name": role_name, "is_deleted": False})
    await User(
        email=email, first_name="T", last_name="User",
        password_hash=hash_password("Passw0rd!23"), role_id=role.id, is_active=True,
    ).insert()
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd!23"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_the_portal_is_granted_on_its_own_permission(client, auth_headers):
    batch = await make_batch()
    coordinator = await _login_as(client, "HR Coordinator", "hr@example.com")
    tutor = await _login_as(client, "Tutor", "tutor@example.com")

    assert (await client.get(f"{PORTAL}/batches/{batch.id}", headers=coordinator)).status_code == 200
    assert (await client.get(f"{PORTAL}/batches/{batch.id}", headers=tutor)).status_code == 403

    offered = (await client.get("/api/v1/permissions", headers=auth_headers, params={"page_size": 100})).json()
    codes = {entry["code"] for entry in offered["items"]}
    assert {"student_portal.view", "student_portal.mark", "student_portal.manage"} <= codes
