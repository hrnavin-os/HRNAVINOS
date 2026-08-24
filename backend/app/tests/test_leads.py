"""Tests for the Lead Management (CRM / Pre-Sales) module."""


async def test_create_lead(client, auth_headers):
    response = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "source": "website", "course_interest": "Data Science"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "new_lead"
    assert body["source"] == "website"


async def test_assign_lead_to_user(client, auth_headers):
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )
    lead_id = create.json()["id"]

    me = (await client.get("/api/v1/auth/me", headers=auth_headers)).json()

    response = await client.post(
        f"/api/v1/leads/{lead_id}/assign", headers=auth_headers, json={"assigned_to": me["id"]}
    )
    assert response.status_code == 200
    assert response.json()["assigned_to"] == me["id"]


async def test_update_lead_status(client, auth_headers):
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )
    lead_id = create.json()["id"]

    response = await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})
    assert response.status_code == 200
    assert response.json()["status"] == "pre_screening"


async def test_filter_leads_by_status(client, auth_headers):
    await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Lead One", "phone": "1111111111", "course_interest": "Data Science"},
    )
    lead_two = (
        await client.post(
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": "Lead Two", "phone": "2222222222", "course_interest": "Data Science"},
        )
    ).json()["id"]
    await client.put(f"/api/v1/leads/{lead_two}", headers=auth_headers, json={"status": "pre_screening"})

    response = await client.get("/api/v1/leads", headers=auth_headers, params={"status": "pre_screening"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == lead_two


async def test_the_course_catalog_offers_courses_nobody_is_on_yet(client, auth_headers):
    """The Course cell on the board sets a course; the filter beside it picks
    from what is in use. They need different lists - a filter offering a course
    nobody is on returns nothing, and a dropdown that only offers courses
    somebody is already on cannot move the first person onto a new one."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )

    catalog = (await client.get("/api/v1/leads/course-catalog", headers=auth_headers)).json()
    in_use = (await client.get("/api/v1/leads/course-options", headers=auth_headers)).json()

    # The live programs lead, so a lead can be moved onto any of them.
    assert "Recruitment + Internship" in catalog
    assert "Recruitment + Internship" not in in_use
    # A value in the data that is not a program is still offered, or the lead
    # carrying it would show a course its own dropdown denies.
    assert "Data Science" in catalog
    assert catalog.index("Data Science") > catalog.index("Recruitment + Internship")
