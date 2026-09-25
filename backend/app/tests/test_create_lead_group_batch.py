"""The Create Lead form's Group and Batch questions."""


async def test_create_lead_carries_its_group_and_batch(client, auth_headers):
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": "Walk In",
            "phone": "9000000001",
            "course_interest": "Data Science",
            "foundation_group": 2,
            "batch_number": "29",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["foundation_group"] == 2
    assert body["batch_number"] == "29"
    # What the board's Batch column shows for a typed batch.
    assert body["batch"] == "Batch-29"

    # And the board's Group filter finds them.
    listed = await client.get("/api/v1/leads", headers=auth_headers, params={"foundation_group": 2})
    assert [lead["id"] for lead in listed.json()["items"]] == [body["id"]]


async def test_group_and_batch_stay_optional(client, auth_headers):
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Phone Enquiry", "phone": "9000000002", "course_interest": "Data Science"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["foundation_group"] is None
    assert created.json()["batch_number"] is None


async def test_a_group_outside_the_range_is_refused(client, auth_headers):
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Walk In", "phone": "9000000003", "course_interest": "Data Science", "foundation_group": 0},
    )
    assert created.status_code == 422
