"""Tests for the Lead Management (CRM / Pre-Sales) module."""


def test_create_lead(client, auth_headers):
    response = client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "source": "website", "course_interest": "Data Science"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "new"
    assert body["source"] == "website"


def test_assign_lead_to_user(client, auth_headers):
    lead_id = client.post(
        "/api/v1/leads", headers=auth_headers, json={"name": "Ravi Kumar", "phone": "9876543210"}
    ).json()["id"]

    me = client.get("/api/v1/auth/me", headers=auth_headers).json()

    response = client.post(f"/api/v1/leads/{lead_id}/assign", headers=auth_headers, json={"assigned_to": me["id"]})
    assert response.status_code == 200
    assert response.json()["assigned_to"] == me["id"]


def test_update_lead_status(client, auth_headers):
    lead_id = client.post(
        "/api/v1/leads", headers=auth_headers, json={"name": "Ravi Kumar", "phone": "9876543210"}
    ).json()["id"]

    response = client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "qualified"})
    assert response.status_code == 200
    assert response.json()["status"] == "qualified"


def test_filter_leads_by_status(client, auth_headers):
    client.post("/api/v1/leads", headers=auth_headers, json={"name": "Lead One", "phone": "1111111111"})
    lead_two = client.post(
        "/api/v1/leads", headers=auth_headers, json={"name": "Lead Two", "phone": "2222222222"}
    ).json()["id"]
    client.put(f"/api/v1/leads/{lead_two}", headers=auth_headers, json={"status": "converted"})

    response = client.get("/api/v1/leads", headers=auth_headers, params={"status": "converted"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == lead_two
