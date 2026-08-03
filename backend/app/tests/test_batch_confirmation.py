"""Tests for the Batch Confirmation module (HR Coordinator)."""
from datetime import date, timedelta

BASE = "/api/v1/batch-confirmation"

# The service refuses to confirm a roster smaller than this.
MINIMUM = 5


async def _make_course(client, auth_headers, *, code="BC101"):
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers,
        json={"name": "Full Stack", "code": code, "duration_weeks": 12, "fee": "50000"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _make_tutor(client, auth_headers, *, email="tutor@hrnavinos.com"):
    user = await client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={"first_name": "Asha", "last_name": "Rao", "email": email, "password": "Password1"},
    )
    assert user.status_code == 201, user.text
    tutor = await client.post(
        "/api/v1/tutors",
        headers=auth_headers,
        json={"user_id": user.json()["id"], "specialization": "Backend", "joining_date": str(date.today())},
    )
    assert tutor.status_code == 201, tutor.text
    return tutor.json()["id"]


async def _make_batch(client, auth_headers, course_id, *, tutor_id=None, capacity=30, name="Batch A"):
    payload = {
        "course_id": course_id,
        "name": name,
        "start_date": str(date.today() + timedelta(days=7)),
        "end_date": str(date.today() + timedelta(days=90)),
        "capacity": capacity,
    }
    if tutor_id:
        payload["tutor_id"] = tutor_id
    response = await client.post("/api/v1/batches", headers=auth_headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _make_ready_lead(client, auth_headers, *, name, phone, email, paid=True):
    """A lead walked down the funnel to batch_confirmation, fee optionally cleared.

    Financial Approval and Batch Confirmation are gates - each can only be
    entered from the stage directly before it (see
    LeadService._validate_stage_transition), so this has to step through
    rather than jump straight to the end.
    """
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": name, "phone": phone, "email": email, "course_interest": "Full Stack"},
    )
    assert create.status_code == 201, create.text
    lead_id = create.json()["id"]

    for stage in ("pre_screening", "financial_approval"):
        step = await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": stage})
        assert step.status_code == 200, step.text

    update = {"status": "batch_confirmation"}
    if paid:
        update["paid_amount"] = "50000"
    response = await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json=update)
    assert response.status_code == 200, response.text
    return lead_id


async def _fill_batch(client, auth_headers, batch_id, count=MINIMUM, *, paid=True):
    lead_ids = []
    for index in range(count):
        lead_id = await _make_ready_lead(
            client,
            auth_headers,
            name=f"Student {index}",
            phone=f"90000000{index:02d}",
            email=f"student{index}@example.com",
            paid=paid,
        )
        response = await client.post(
            f"{BASE}/allocations", headers=auth_headers, json={"lead_id": lead_id, "batch_id": batch_id}
        )
        assert response.status_code == 200, response.text
        lead_ids.append(lead_id)
    return lead_ids


# ---------- Forming the group ----------


async def test_form_options_resolves_tutor_names(client, auth_headers):
    await _make_course(client, auth_headers)
    await _make_tutor(client, auth_headers)

    response = await client.get(f"{BASE}/options", headers=auth_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [course["label"] for course in body["courses"]] == ["Full Stack"]
    # The point of this endpoint: a name, not the bare user_id TutorResponse carries.
    assert body["tutors"][0]["label"] == "Asha Rao"
    assert body["tutors"][0]["detail"] == "Backend"


async def test_coordinator_can_create_a_batch_group(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)

    response = await client.post(
        f"{BASE}/batches",
        headers=auth_headers,
        json={
            "course_id": course_id,
            "tutor_id": tutor_id,
            "name": "Morning Batch",
            "start_date": str(date.today() + timedelta(days=7)),
            "end_date": str(date.today() + timedelta(days=90)),
            "capacity": 20,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "Morning Batch"

    # It shows up on the dashboard straight away, ready to be filled.
    batches = (await client.get(f"{BASE}/batches", headers=auth_headers)).json()
    assert [batch["batch_name"] for batch in batches] == ["Morning Batch"]
    assert batches[0]["tutor_name"] == "Asha Rao"


# ---------- Queue ----------


async def test_pending_queue_lists_only_batch_confirmation_leads(client, auth_headers):
    await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Early Lead", "phone": "9111111111", "course_interest": "Full Stack"},
    )
    await _make_ready_lead(
        client, auth_headers, name="Ready Lead", phone="9222222222", email="ready@example.com"
    )

    response = await client.get(f"{BASE}/pending-leads", headers=auth_headers)
    assert response.status_code == 200
    names = [lead["name"] for lead in response.json()]
    assert names == ["Ready Lead"]


async def test_allocated_lead_leaves_the_queue(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id)
    lead_id = await _make_ready_lead(
        client, auth_headers, name="Ready Lead", phone="9222222222", email="ready@example.com"
    )

    allocate = await client.post(
        f"{BASE}/allocations", headers=auth_headers, json={"lead_id": lead_id, "batch_id": batch_id}
    )
    assert allocate.status_code == 200, allocate.text

    queue = await client.get(f"{BASE}/pending-leads", headers=auth_headers)
    assert queue.json() == []

    detail = await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)
    assert detail.json()["allocated_count"] == 1


# ---------- Allocation rules ----------


async def test_cannot_allocate_lead_not_at_batch_confirmation(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id)
    lead_id = (
        await client.post(
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": "Too Early", "phone": "9333333333", "course_interest": "Full Stack"},
        )
    ).json()["id"]

    response = await client.post(
        f"{BASE}/allocations", headers=auth_headers, json={"lead_id": lead_id, "batch_id": batch_id}
    )
    assert response.status_code == 422


async def test_cannot_allocate_same_lead_twice(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id)
    lead_id = await _make_ready_lead(
        client, auth_headers, name="Ready Lead", phone="9222222222", email="ready@example.com"
    )
    payload = {"lead_id": lead_id, "batch_id": batch_id}

    assert (await client.post(f"{BASE}/allocations", headers=auth_headers, json=payload)).status_code == 200
    second = await client.post(f"{BASE}/allocations", headers=auth_headers, json=payload)
    assert second.status_code == 409


async def test_cannot_exceed_batch_capacity(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, capacity=1)
    await _fill_batch(client, auth_headers, batch_id, count=1)

    overflow = await _make_ready_lead(
        client, auth_headers, name="Overflow", phone="9444444444", email="overflow@example.com"
    )
    response = await client.post(
        f"{BASE}/allocations", headers=auth_headers, json={"lead_id": overflow, "batch_id": batch_id}
    )
    assert response.status_code == 409


async def test_withdraw_returns_lead_to_queue(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id)
    lead_id = await _make_ready_lead(
        client, auth_headers, name="Ready Lead", phone="9222222222", email="ready@example.com"
    )
    await client.post(f"{BASE}/allocations", headers=auth_headers, json={"lead_id": lead_id, "batch_id": batch_id})

    detail = await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)
    allocation_id = detail.json()["allocations"][0]["allocation_id"]

    withdraw = await client.post(
        f"{BASE}/allocations/{allocation_id}/withdraw", headers=auth_headers, json={"reason": "Deferred"}
    )
    assert withdraw.status_code == 200

    queue = await client.get(f"{BASE}/pending-leads", headers=auth_headers)
    assert [lead["id"] for lead in queue.json()] == [lead_id]


# ---------- Readiness + confirmation ----------


async def test_batch_without_tutor_is_not_ready(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id)
    await _fill_batch(client, auth_headers, batch_id)

    detail = (await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)).json()
    assert detail["can_confirm"] is False
    failed = {check["code"] for check in detail["checks"] if not check["passed"]}
    assert failed == {"tutor_assigned"}


async def test_unpaid_lead_blocks_confirmation(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id, paid=False)

    detail = (await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)).json()
    assert detail["can_confirm"] is False
    assert "fees_cleared" in {check["code"] for check in detail["checks"] if not check["passed"]}

    confirm = await client.post(f"{BASE}/batches/{batch_id}/confirm", headers=auth_headers)
    assert confirm.status_code == 422


async def test_below_minimum_strength_blocks_confirmation(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id, count=MINIMUM - 1)

    detail = (await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)).json()
    assert detail["can_confirm"] is False
    assert "minimum_strength" in {check["code"] for check in detail["checks"] if not check["passed"]}


async def test_confirm_batch_creates_students_and_admissions(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id)

    detail = (await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)).json()
    assert detail["can_confirm"] is True

    confirm = await client.post(f"{BASE}/batches/{batch_id}/confirm", headers=auth_headers)
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    assert body["students_created"] == MINIMUM
    assert body["admissions_created"] == MINIMUM
    assert body["status"] == "confirmed"

    students = await client.get("/api/v1/students", headers=auth_headers, params={"page_size": 50})
    assert students.json()["total"] == MINIMUM

    admissions = await client.get("/api/v1/admissions", headers=auth_headers, params={"page_size": 50})
    assert admissions.json()["total"] == MINIMUM

    batch = await client.get(f"/api/v1/batches/{batch_id}", headers=auth_headers)
    assert batch.json()["status"] == "confirmed"


async def test_confirmed_batch_rejects_further_allocation(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id)
    await client.post(f"{BASE}/batches/{batch_id}/confirm", headers=auth_headers)

    latecomer = await _make_ready_lead(
        client, auth_headers, name="Latecomer", phone="9555555555", email="late@example.com"
    )
    response = await client.post(
        f"{BASE}/allocations", headers=auth_headers, json={"lead_id": latecomer, "batch_id": batch_id}
    )
    assert response.status_code == 409


async def test_confirmed_seat_cannot_be_withdrawn(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id)
    await client.post(f"{BASE}/batches/{batch_id}/confirm", headers=auth_headers)

    detail = (await client.get(f"{BASE}/batches/{batch_id}", headers=auth_headers)).json()
    allocation_id = detail["allocations"][0]["allocation_id"]

    response = await client.post(
        f"{BASE}/allocations/{allocation_id}/withdraw", headers=auth_headers, json={"reason": "Changed mind"}
    )
    assert response.status_code == 409


async def test_summary_counters(client, auth_headers):
    course_id = await _make_course(client, auth_headers)
    tutor_id = await _make_tutor(client, auth_headers)
    batch_id = await _make_batch(client, auth_headers, course_id, tutor_id=tutor_id)
    await _fill_batch(client, auth_headers, batch_id)
    await _make_ready_lead(client, auth_headers, name="Waiting", phone="9666666666", email="waiting@example.com")

    summary = (await client.get(f"{BASE}/summary", headers=auth_headers)).json()
    assert summary["pending_allocation"] == 1
    assert summary["allocated_awaiting_confirmation"] == MINIMUM
    assert summary["batches_ready_to_confirm"] == 1
    assert summary["students_placed"] == 0

    await client.post(f"{BASE}/batches/{batch_id}/confirm", headers=auth_headers)
    after = (await client.get(f"{BASE}/summary", headers=auth_headers)).json()
    assert after["students_placed"] == MINIMUM
    assert after["batches_confirmed"] == 1
