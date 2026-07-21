"""Tests for the Student Management module."""


async def _create_course(client, auth_headers):
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers,
        json={"name": "Full Stack Development", "code": "FSD-01", "duration_weeks": 12, "fee": "25000.00"},
    )
    return response.json()["id"]


async def test_create_student(client, auth_headers):
    course_id = await _create_course(client, auth_headers)
    response = await client.post(
        "/api/v1/students",
        headers=auth_headers,
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane.doe@example.com",
            "course_id": course_id,
            "admission_date": "2026-07-01",
        },
    )
    assert response.status_code == 201
    assert response.json()["status"] == "active"


async def test_duplicate_student_email_rejected(client, auth_headers):
    payload = {"first_name": "Jane", "last_name": "Doe", "email": "jane.doe@example.com", "admission_date": "2026-07-01"}
    await client.post("/api/v1/students", headers=auth_headers, json=payload)
    response = await client.post("/api/v1/students", headers=auth_headers, json=payload)
    assert response.status_code == 409


async def test_create_student_with_unknown_course_returns_404(client, auth_headers):
    response = await client.post(
        "/api/v1/students",
        headers=auth_headers,
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane.doe@example.com",
            "course_id": "00000000-0000-0000-0000-000000000000",
            "admission_date": "2026-07-01",
        },
    )
    assert response.status_code == 404
