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


# --------------------------------------------------------------------------
# What the role editor is offered
# --------------------------------------------------------------------------


async def test_permission_list_offers_only_the_modules_the_app_surfaces(client, auth_headers):
    """The catalogue carries every code the system enforces, including the
    modules built ahead of the product. The role editor is offered the ones
    behind a menu - a permission granting access to a page nothing links to is
    noise between the choices that decide what somebody can do."""
    from app.permissions.permission_codes import OFFERED_MODULES

    offered = (await client.get("/api/v1/permissions", headers=auth_headers, params={"page_size": 100})).json()
    modules = {row["module"] for row in offered["items"]}
    assert modules <= OFFERED_MODULES
    # The board's own module is one of them; the classroom register isn't.
    assert "induction_attendance" in modules
    assert "attendance" not in modules
    # A code inside an offered module that nothing enforces isn't offered.
    assert "payments.delete" not in {row["code"] for row in offered["items"]}
    assert offered["total"] == len(offered["items"])


async def test_the_raw_catalogue_is_still_reachable(client, auth_headers):
    """Hiding a module from the editor is not deleting it: every code is still
    listed, still enforced, and still grantable through the API."""
    everything = (
        await client.get(
            "/api/v1/permissions",
            headers=auth_headers,
            params={"page_size": 100, "offered_only": "false"},
        )
    ).json()
    modules = {row["module"] for row in everything["items"]}
    assert "attendance" in modules
    assert "students" in modules


async def test_a_hidden_grant_survives_editing_the_role(client, auth_headers):
    """HR Coordinator carries students.view, whose module the editor doesn't
    show. Saving the role from the editor sends back the ids it was given, so
    the grant has to come through untouched - hiding a permission must never
    be a way of silently revoking it."""
    role_id = await _get_role_id(client, auth_headers, "HR Coordinator")
    role = (await client.get(f"/api/v1/roles/{role_id}", headers=auth_headers)).json()
    kept = [permission["id"] for permission in role["permissions"]]
    assert any(permission["code"] == "students.view" for permission in role["permissions"])

    updated = await client.put(
        f"/api/v1/roles/{role_id}",
        headers=auth_headers,
        json={"permission_ids": kept, "description": "Edited from the role editor"},
    )
    assert updated.status_code == 200
    assert any(permission["code"] == "students.view" for permission in updated.json()["permissions"])
