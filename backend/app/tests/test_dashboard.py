"""Tests for the Dashboard overview endpoint."""


async def test_dashboard_overview_reflects_created_data(client, auth_headers):
    await client.post(
        "/api/v1/courses",
        headers=auth_headers,
        json={"name": "Full Stack Development", "code": "FSD-01", "duration_weeks": 12, "fee": "25000.00"},
    )
    await client.post("/api/v1/leads", headers=auth_headers, json={"name": "Ravi Kumar", "phone": "9876543210"})

    response = await client.get("/api/v1/dashboard/overview", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_leads"] == 1
    assert body["new_leads"] == 1
    assert body["total_students"] == 0
