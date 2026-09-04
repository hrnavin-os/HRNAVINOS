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
    # The institute overview is a page somebody decides a role should read, so
    # it is on the list of things they can decide.
    assert "dashboard" in modules
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


# --------------------------------------------------------------------------
# The institute overview
# --------------------------------------------------------------------------


async def test_the_overview_is_a_grant_rather_than_something_every_login_gets(client, auth_headers):
    """Revenue, students, tutors and placements across the institute is not
    figures for whoever happens to be logged in. Finance works its own board
    and isn't granted the overview; a Tutor is, so the same endpoint answers
    them differently."""
    await _create_user_with_role(client, auth_headers, "Finance", "finance-overview@hrnavinos.com")
    finance_headers = await _login(client, "finance-overview@hrnavinos.com", "TutorPass123")
    refused = await client.get("/api/v1/dashboard/overview", headers=finance_headers)
    assert refused.status_code == 403
    assert refused.json()["error_code"] == "FORBIDDEN"

    await _create_user_with_role(client, auth_headers, "Tutor", "tutor-overview@hrnavinos.com")
    tutor_headers = await _login(client, "tutor-overview@hrnavinos.com", "TutorPass123")
    assert (await client.get("/api/v1/dashboard/overview", headers=tutor_headers)).status_code == 200


# --------------------------------------------------------------------------
# Deleting a user or a role
# --------------------------------------------------------------------------


async def _new_user(client, auth_headers, email: str = "leaver@hrnavinos.com") -> str:
    return (await _create_user_with_role(client, auth_headers, "Tutor", email))["id"]


async def test_deleting_a_user_requires_a_reason(client, auth_headers):
    user_id = await _new_user(client, auth_headers)

    assert (await client.request("DELETE", f"/api/v1/users/{user_id}", headers=auth_headers)).status_code == 422
    blank = await client.request(
        "DELETE", f"/api/v1/users/{user_id}", headers=auth_headers, json={"reason": "  "}
    )
    assert blank.status_code == 422


async def test_a_deleted_user_moves_to_the_deleted_list_with_its_reason(client, auth_headers):
    user_id = await _new_user(client, auth_headers)

    deleted = await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        headers=auth_headers,
        json={"reason": "Left the company on 30 Aug"},
    )
    assert deleted.status_code == 200

    live = await client.get("/api/v1/users", headers=auth_headers, params={"page_size": 100})
    assert user_id not in {row["id"] for row in live.json()["items"]}

    removed = await client.get(
        "/api/v1/users", headers=auth_headers, params={"page_size": 100, "deleted": "true"}
    )
    row = next(item for item in removed.json()["items"] if item["id"] == user_id)
    assert row["deleted_reason"] == "Left the company on 30 Aug"
    assert row["deleted_at"]
    # Attributed, not anonymous: a deletion nobody's name is against is a
    # decision nobody can be asked about.
    assert row["deleted_by_name"]


async def test_deleting_a_role_requires_a_reason_and_keeps_it(client, auth_headers):
    created = await client.post(
        "/api/v1/roles",
        headers=auth_headers,
        json={"name": "Temp Role", "description": "For the test", "permission_ids": []},
    )
    role_id = created.json()["id"]

    assert (await client.request("DELETE", f"/api/v1/roles/{role_id}", headers=auth_headers)).status_code == 422

    deleted = await client.request(
        "DELETE", f"/api/v1/roles/{role_id}", headers=auth_headers, json={"reason": "Replaced by Admin-Coordinator"}
    )
    assert deleted.status_code == 200

    live = await client.get("/api/v1/roles", headers=auth_headers, params={"page_size": 100})
    assert role_id not in {row["id"] for row in live.json()["items"]}

    removed = await client.get(
        "/api/v1/roles", headers=auth_headers, params={"page_size": 100, "deleted": "true"}
    )
    row = next(item for item in removed.json()["items"] if item["id"] == role_id)
    assert row["deleted_reason"] == "Replaced by Admin-Coordinator"
    assert row["deleted_by_name"]


async def test_a_system_role_still_cannot_be_deleted_with_a_reason(client, auth_headers):
    """The reason is a record of a decision, not permission to make one."""
    role_id = await _get_role_id(client, auth_headers, "Super Admin")
    response = await client.request(
        "DELETE", f"/api/v1/roles/{role_id}", headers=auth_headers, json={"reason": "Tidying up"}
    )
    assert response.status_code == 403
