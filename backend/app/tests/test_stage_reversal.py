"""Moving a lead back to an earlier stage has to say why, and the why is on
the lead's timeline beside the move."""


async def make_lead(client, auth_headers) -> str:
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "hrnavin os", "phone": "7894561230", "course_interest": "HR Recruitment"},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def move(client, auth_headers, lead_id: str, **body):
    return await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json=body)


async def test_moving_forward_needs_no_reason(client, auth_headers):
    lead_id = await make_lead(client, auth_headers)

    response = await move(client, auth_headers, lead_id, status="pre_screening")

    assert response.status_code == 200, response.text


async def test_moving_back_without_a_reason_is_refused(client, auth_headers):
    lead_id = await make_lead(client, auth_headers)
    await move(client, auth_headers, lead_id, status="pre_screening")

    response = await move(client, auth_headers, lead_id, status="new_lead")

    assert response.status_code == 400
    assert "reason" in response.json()["message"].lower()
    lead = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert lead["status"] == "pre_screening"


async def test_moving_back_puts_the_reason_on_the_timeline(client, auth_headers):
    lead_id = await make_lead(client, auth_headers)
    await move(client, auth_headers, lead_id, status="pre_screening")

    response = await move(
        client, auth_headers, lead_id, status="rnr", stage_change_reason="Student asked to call next week"
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rnr"
    timeline = (await client.get(f"/api/v1/leads/{lead_id}/timeline", headers=auth_headers)).json()
    latest = timeline[0]
    assert latest["action"] == "STAGE_BACK"
    assert latest["changes"]["previous_status"] == "pre_screening"
    assert latest["changes"]["status"] == "rnr"
    assert latest["changes"]["reason"] == "Student asked to call next week"
    # A reason is not a lead field.
    assert "stage_change_reason" not in latest["changes"]


async def test_quit_keeps_its_own_reason_and_is_not_a_move_back(client, auth_headers):
    lead_id = await make_lead(client, auth_headers)

    response = await move(client, auth_headers, lead_id, status="lost", lost_reason="Joined elsewhere")

    assert response.status_code == 200, response.text
    timeline = (await client.get(f"/api/v1/leads/{lead_id}/timeline", headers=auth_headers)).json()
    assert timeline[0]["action"] == "UPDATE"
    assert timeline[0]["changes"]["lost_reason"] == "Joined elsewhere"
