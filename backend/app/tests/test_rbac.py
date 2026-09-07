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


# --------------------------------------------------------------------------
# Every menu is granted on its own
# --------------------------------------------------------------------------


async def test_every_sidebar_menu_has_a_permission_of_its_own(client, auth_headers):
    """The role editor offers one module per sidebar entry, so access can be
    decided menu by menu. Four of them used to have no code of their own -
    Statistics and Form Collection rode on leads.view, WhatsApp Links on
    batch_confirmation.view, Notifications on nothing at all - which meant
    those pages came along with a neighbour's grant whether or not anybody
    meant them to."""
    offered = (await client.get("/api/v1/permissions", headers=auth_headers, params={"page_size": 100})).json()
    modules = {row["module"] for row in offered["items"]}
    codes = {row["code"] for row in offered["items"]}

    # The sidebar, top to bottom.
    assert {
        "dashboard",            # Dashboard
        "lead_analytics",       # Statistics
        "leads",                # Lead Dashboard
        "notifications",        # Notifications
        "form_collection",      # Form Collection
        "induction_attendance", # Attendance
        "programs",             # Programs
        "batch_confirmation",   # Batch Confirmation
        "whatsapp_links",       # WhatsApp Links
        "payments",             # Finance
        "users",                # Employee > Users
        "roles",                # Employee > Roles
        "settings",             # Settings
    } <= modules

    # Reading the Form Collection board and rewriting the form behind it are
    # separate grants, so a role can be shown the sections without being able
    # to change what the public is asked.
    assert {"form_collection.view", "form_collection.configure"} <= codes


async def test_statistics_is_refused_to_a_role_that_only_has_the_lead_rows(client, auth_headers):
    """Granting somebody the Lead Dashboard is no longer the same as granting
    them the board that summarises every section of it. Enforced on the
    endpoint, not just the sidebar, so the page isn't reachable by URL."""
    role_id = await _get_role_id(client, auth_headers, "Finance")
    role = (await client.get(f"/api/v1/roles/{role_id}", headers=auth_headers)).json()
    assert any(permission["code"] == "leads.view" for permission in role["permissions"])
    assert not any(permission["code"] == "lead_analytics.view" for permission in role["permissions"])

    await _create_user_with_role(client, auth_headers, "Finance", "finance-stats@hrnavinos.com")
    finance_headers = await _login(client, "finance-stats@hrnavinos.com", "TutorPass123")

    refused = await client.get("/api/v1/induction-entries/analytics", headers=finance_headers)
    assert refused.status_code == 403
    assert refused.json()["error_code"] == "FORBIDDEN"
    # The lead rows themselves are still theirs to read.
    assert (await client.get("/api/v1/leads", headers=finance_headers)).status_code == 200


async def test_a_board_can_read_the_section_list_on_its_own_permission(client, auth_headers):
    """The Foundation Form config carries the section list that five different
    menus draw. Requiring leads.view to read it would have meant a role granted
    only Statistics still needing the Lead Dashboard's permission to fill in
    its own section filter - the coupling this split exists to undo."""
    offered = (await client.get("/api/v1/permissions", headers=auth_headers, params={"page_size": 100})).json()
    by_code = {row["code"]: row["id"] for row in offered["items"]}

    created = await client.post(
        "/api/v1/roles",
        headers=auth_headers,
        json={
            "name": "Statistics Only",
            "description": "The summary board and nothing else",
            "permission_ids": [by_code["lead_analytics.view"]],
        },
    )
    assert created.status_code == 201, created.text

    await _create_user_with_role(client, auth_headers, "Statistics Only", "stats-only@hrnavinos.com")
    stats_headers = await _login(client, "stats-only@hrnavinos.com", "TutorPass123")

    # Its own board and the section list its filter is built from, both on the
    # one permission.
    assert (await client.get("/api/v1/induction-entries/analytics", headers=stats_headers)).status_code == 200
    assert (await client.get("/api/v1/foundation-form/config", headers=stats_headers)).status_code == 200
    # The lead rows are still a separate grant it wasn't given.
    assert (await client.get("/api/v1/leads", headers=stats_headers)).status_code == 403


async def test_setting_a_group_link_needs_the_whatsapp_menu_not_the_batch_board(client, auth_headers):
    """The link every incoming student is sent to is its own menu, so it is its
    own grant. Reading the links stays open to the Batch Confirmation board,
    which shows which group a student went to."""
    from app.models.permission import Permission
    from app.models.role import Role

    whatsapp = await Permission.find_one({"code": "whatsapp_links.view"})
    role = await Role.find_one({"name": "HR Coordinator", "is_deleted": False})
    assert whatsapp.id in role.permission_ids

    # Take the menu away, leaving the Batch Confirmation board untouched.
    role.permission_ids = [pid for pid in role.permission_ids if pid != whatsapp.id]
    await role.save()

    await _create_user_with_role(client, auth_headers, "HR Coordinator", "hrc-links@hrnavinos.com")
    hrc_headers = await _login(client, "hrc-links@hrnavinos.com", "TutorPass123")

    assert (await client.get("/api/v1/batch-confirmation/whatsapp-links", headers=hrc_headers)).status_code == 200
    refused = await client.put(
        "/api/v1/batch-confirmation/whatsapp-links/a",
        headers=hrc_headers,
        json={"whatsapp_group_url": "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt"},
    )
    assert refused.status_code == 403


# --------------------------------------------------------------------------
# Splitting a menu's permission out of its neighbour's
# --------------------------------------------------------------------------


async def test_a_menu_that_was_reachable_stays_reachable_after_its_code_is_split_out(client, auth_headers):
    """Statistics and Form Collection were both opened by leads.view. Giving
    them codes of their own would have hidden two working pages from every role
    in the database the moment it deployed, so the boot that first adds those
    codes hands them to whoever could already open the page.

    Not to be confused with a default: it keys off the code being new to the
    catalogue, which happens once. See the test below."""
    from app.database.backfills import backfill_navigation_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    codes = ["lead_analytics.view", "form_collection.view"]
    ids = {code: (await Permission.find_one({"code": code})).id for code in codes}

    # Put a role back to before the split: it holds leads.view and neither of
    # the two menus that used to come with it.
    finance = await Role.find_one({"name": "Finance", "is_deleted": False})
    finance.permission_ids = [pid for pid in finance.permission_ids if pid not in ids.values()]
    await finance.save()

    granted = await backfill_navigation_permissions(set(codes))

    assert granted >= 2
    restored = await Role.find_one({"name": "Finance", "is_deleted": False})
    assert all(permission_id in restored.permission_ids for permission_id in ids.values())


async def test_a_menu_taken_away_by_hand_is_not_handed_back_on_the_next_boot(client, auth_headers):
    """The whole point of a menu having its own permission is that it can be
    withheld. Re-running the grandfathering every boot would put Statistics
    back on any role holding leads.view, which would make the new permission
    impossible to take away."""
    from app.database.backfills import backfill_navigation_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    analytics = await Permission.find_one({"code": "lead_analytics.view"})
    finance = await Role.find_one({"name": "Finance", "is_deleted": False})
    finance.permission_ids = [pid for pid in finance.permission_ids if pid != analytics.id]
    await finance.save()

    # A later boot: the code is already in the catalogue, so nothing is new.
    assert await backfill_navigation_permissions(set()) == 0

    unchanged = await Role.find_one({"name": "Finance", "is_deleted": False})
    assert analytics.id not in unchanged.permission_ids


async def test_a_section_admin_keeps_the_notifications_menu(client, auth_headers):
    """Notifications had no permission behind it at all - it was shown to any
    user whose role is scoped to a section, since Finance's payment reminders
    are addressed to them. So the thing to grandfather on is the scope."""
    from app.database.backfills import backfill_navigation_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    notifications = await Permission.find_one({"code": "notifications.view"})
    section_admin = await Role.find_one({"name": "A-Section Admin", "is_deleted": False})
    section_admin.permission_ids = [pid for pid in section_admin.permission_ids if pid != notifications.id]
    await section_admin.save()

    assert await backfill_navigation_permissions({"notifications.view"}) >= 1

    restored = await Role.find_one({"name": "A-Section Admin", "is_deleted": False})
    assert restored.scoped_section == "a"
    assert notifications.id in restored.permission_ids
