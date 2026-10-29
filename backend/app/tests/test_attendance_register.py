"""The attendance register: the batch laid out as the attendance sheet was, with
each class's start (H) and end (C) checks taken from Meet's join and leave
times, staff ticks for a class taken by hand, and the remarks."""
from datetime import timedelta

from app.models.enums import LeadStatus
from app.models.lead import Lead
from app.services.class_attendance_service import ClassAttendanceService, local_today
from app.services.meet_attendance_service import day_window, roll_up
from app.tests.test_student_portal import CODE, PORTAL, call_ended, make_batch, make_class, make_student

YESTERDAY = local_today() - timedelta(days=1)


def at(clock: str):
    """A time on YESTERDAY in the institute's zone, as the UTC instant Meet logs."""
    hours, minutes = (int(part) for part in clock.split(":"))
    return day_window(YESTERDAY)[0] + timedelta(hours=hours, minutes=minutes)


def stay(identifier, joined: str, left: str):
    seconds = int((at(left) - at(joined)).total_seconds())
    return call_ended(identifier, seconds, left=at(left))


async def register(client, headers, batch) -> dict:
    response = await client.get(f"{PORTAL}/batches/{batch.id}/register", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def cell_of(body, name, index=0) -> dict:
    return next(row for row in body["rows"] if row["name"].startswith(name))["cells"][index]


async def test_the_checks_come_from_meets_join_and_leave_times(client, auth_headers):
    batch = await make_batch()
    for first in ("Arun", "Bala", "Chitra", "Devi"):
        await make_student(batch, first, f"{first.lower()}@mail.com")
    session = await make_class(batch, meeting_code=CODE, held_on=YESTERDAY, start_time="19:00")
    people = roll_up(
        [
            # The tutor, on nobody's roster, is last out - which is the class's end.
            stay("tutor@institute.com", "18:50", "21:05"),
            stay("arun@mail.com", "19:02", "21:04"),
            stay("bala@mail.com", "19:00", "20:00"),
            stay("chitra@mail.com", "19:40", "21:05"),
        ],
        CODE,
    )
    await ClassAttendanceService().apply_live(session, people)

    body = await register(client, auth_headers, batch)

    arun, bala, chitra, devi = (cell_of(body, name) for name in ("Arun", "Bala", "Chitra", "Devi"))
    assert (arun["start"], arun["end"], arun["note"]) == (True, True, None)
    assert (bala["start"], bala["end"], bala["note"]) == (True, False, "Went out early")
    assert (chitra["start"], chitra["end"], chitra["note"]) == (False, True, "Joined late")
    assert (devi["start"], devi["end"], devi["attended"]) == (False, False, False)
    assert all(cell["attended"] for cell in (arun, bala, chitra))
    assert not arun["start_marked"]

    # The checks are taken on read, so moving the start re-takes them at once.
    response = await client.put(f"{PORTAL}/sessions/{session.id}", headers=auth_headers, json={"start_time": "19:30"})
    assert response.status_code == 200, response.text
    assert cell_of(await register(client, auth_headers, batch), "Chitra")["start"] is True


async def test_a_class_taken_by_hand_is_ticked_on_the_register(client, auth_headers):
    batch = await make_batch()
    arun = await make_student(batch, "Arun", "arun@mail.com")
    session = await make_class(batch, held_on=YESTERDAY)
    url = f"{PORTAL}/sessions/{session.id}/students/{arun.id}/checks"

    cell = cell_of(await register(client, auth_headers, batch), "Arun")
    assert (cell["start"], cell["end"], cell["attended"]) == (None, None, False)

    assert (await client.put(url, headers=auth_headers, json={"start": True})).status_code == 200
    body = await register(client, auth_headers, batch)
    cell = cell_of(body, "Arun")
    assert (cell["start"], cell["start_marked"], cell["attended"], cell["via"]) == (True, True, True, "manual")
    assert body["rows"][0]["totals"]["attended"] == 1

    # Only what is sent changes: unticking the end leaves the start ticked.
    await client.put(url, headers=auth_headers, json={"end": False})
    cell = cell_of(await register(client, auth_headers, batch), "Arun")
    assert (cell["start"], cell["end"], cell["note"]) == (True, False, "Went out early")

    # None hands the check back to Meet, which hasn't been read for this class.
    await client.put(url, headers=auth_headers, json={"start": None, "end": None})
    cell = cell_of(await register(client, auth_headers, batch), "Arun")
    assert (cell["start"], cell["start_marked"], cell["attended"]) == (None, False, False)


async def test_a_class_still_to_come_has_nothing_to_check(client, auth_headers):
    batch = await make_batch()
    await make_student(batch, "Arun", "arun@mail.com")
    await make_class(batch, held_on=local_today() + timedelta(days=2))

    cell = cell_of(await register(client, auth_headers, batch), "Arun")
    assert (cell["start"], cell["end"], cell["attended"], cell["note"]) == (None, None, None, None)


async def test_the_register_writes_the_sheets_batch_code(client, auth_headers):
    lead = Lead(
        name="Aarthi B",
        phone="9566669413",
        email="aarthi@mail.com",
        status=LeadStatus.BATCH_CONFIRMATION,
        batch_number="29",
        section="a",
    )
    await lead.insert()
    listed = (await client.get(f"{PORTAL}/batches", headers=auth_headers)).json()

    response = await client.get(f"{PORTAL}/batches/{listed[0]['id']}/register", headers=auth_headers)
    assert response.status_code == 200, response.text
    row = response.json()["rows"][0]
    assert (row["name"], row["section"], row["code"]) == ("Aarthi B", "A", "B-29A")


async def test_a_student_from_another_batch_cant_be_ticked(client, auth_headers):
    batch = await make_batch()
    stranger = await make_student(await make_batch("Batch-8"), "Dev", "dev@mail.com")
    session = await make_class(batch, held_on=YESTERDAY)

    response = await client.put(
        f"{PORTAL}/sessions/{session.id}/students/{stranger.id}/checks", headers=auth_headers, json={"start": True}
    )
    assert response.status_code == 400
