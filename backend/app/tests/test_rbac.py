"""Tests for role-based access control enforcement."""


async def _get_role_id(client, auth_headers, name: str) -> str:
    roles = (await client.get("/api/v1/roles", headers=auth_headers, params={"page_size": 100})).json()["items"]
    return next(r["id"] for r in roles if r["name"] == name)


async def _create_user_with_role(client, auth_headers, role_name: str, email: str, password: str = "TutorPass123"):
    role_id = await _get_role_id(client, auth_headers, role_name)
    response = await client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "email": email,
            "password": password,
            "first_name": "Test",
            "last_name": "User",
            "role_id": role_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _login(client, email: str, password: str) -> dict:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_tutor_role_cannot_create_students(client, auth_headers):
    await _create_user_with_role(client, auth_headers, "Tutor", "tutor1@hrnavinos.com")
    tutor_headers = await _login(client, "tutor1@hrnavinos.com", "TutorPass123")

    response = await client.post(
        "/api/v1/students",
        headers=tutor_headers,
        json={"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com", "admission_date": "2026-07-01"},
    )
    assert response.status_code == 403
    assert response.json()["error_code"] == "FORBIDDEN"


async def test_tutor_role_can_view_students(client, auth_headers):
    await _create_user_with_role(client, auth_headers, "Tutor", "tutor2@hrnavinos.com")
    tutor_headers = await _login(client, "tutor2@hrnavinos.com", "TutorPass123")

    response = await client.get("/api/v1/students", headers=tutor_headers)
    assert response.status_code == 200


async def test_deactivated_user_cannot_authenticate_with_old_token(client, auth_headers):
    user = await _create_user_with_role(client, auth_headers, "Tutor", "tutor3@hrnavinos.com")
    tutor_headers = await _login(client, "tutor3@hrnavinos.com", "TutorPass123")

    deactivate = await client.post(f"/api/v1/users/{user['id']}/deactivate", headers=auth_headers)
    assert deactivate.status_code == 200

    response = await client.get("/api/v1/auth/me", headers=tutor_headers)
    assert response.status_code == 401
