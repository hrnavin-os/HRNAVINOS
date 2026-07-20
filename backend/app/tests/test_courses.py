"""Tests for the Course Management module."""


def _create_course(client, auth_headers, code="FSD-01"):
    return client.post(
        "/api/v1/courses",
        headers=auth_headers,
        json={"name": "Full Stack Development", "code": code, "duration_weeks": 12, "fee": "25000.00"},
    )


def test_create_course(client, auth_headers):
    response = _create_course(client, auth_headers)
    assert response.status_code == 201
    body = response.json()
    assert body["code"] == "FSD-01"
    assert body["is_active"] is True


def test_duplicate_course_code_rejected(client, auth_headers):
    _create_course(client, auth_headers)
    response = _create_course(client, auth_headers)
    assert response.status_code == 409
    assert response.json()["error_code"] == "ALREADY_EXISTS"


def test_list_courses_paginated(client, auth_headers):
    _create_course(client, auth_headers, code="FSD-01")
    _create_course(client, auth_headers, code="DA-01")

    response = client.get("/api/v1/courses", headers=auth_headers, params={"page": 1, "page_size": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["total_pages"] == 2
    assert len(body["items"]) == 1


def test_update_course(client, auth_headers):
    course_id = _create_course(client, auth_headers).json()["id"]
    response = client.put(f"/api/v1/courses/{course_id}", headers=auth_headers, json={"fee": "30000.00"})
    assert response.status_code == 200
    assert response.json()["fee"] == "30000.00"


def test_delete_course_is_soft_delete(client, auth_headers):
    course_id = _create_course(client, auth_headers).json()["id"]
    response = client.delete(f"/api/v1/courses/{course_id}", headers=auth_headers)
    assert response.status_code == 200

    get_response = client.get(f"/api/v1/courses/{course_id}", headers=auth_headers)
    assert get_response.status_code == 404


def test_create_course_requires_authentication(client):
    response = client.post(
        "/api/v1/courses",
        json={"name": "Full Stack Development", "code": "FSD-01", "duration_weeks": 12, "fee": "25000.00"},
    )
    assert response.status_code == 401
