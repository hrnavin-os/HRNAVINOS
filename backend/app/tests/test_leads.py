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


async def test_the_course_catalog_is_the_programs_and_only_the_programs(client, auth_headers):
    """Programs Management is where the courses are decided. The board's Course
    dropdown offers those and nothing else - padded with whatever is already
    recorded, it would quietly re-admit the junk from imports and test rows, and
    the list would grow by being wrong rather than by anybody adding a course.

    The filter's list is the other way round on purpose: it is the values in
    use, because an option that matches no lead is a dead end to filter by."""
    await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )

    catalog = (await client.get("/api/v1/leads/course-catalog", headers=auth_headers)).json()
    in_use = (await client.get("/api/v1/leads/course-options", headers=auth_headers)).json()

    assert "Recruitment + Internship" in catalog
    assert "Data Science" not in catalog
    # And the filter still answers for the data rather than the catalogue.
    assert in_use == ["Data Science"]


async def test_admin_keeps_the_programs_tab_on_an_existing_database(client, auth_headers):
    """DEFAULT_ROLE_PERMISSIONS is a seed, not a migration: adding a permission
    to a role there changes what a fresh database gets and leaves every
    existing one as it was. The startup backfill closes that gap, which is the
    only reason the Programs tab appears for an Admin who was created before
    the role gained it."""
    from app.database.backfills import backfill_role_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    admin = await Role.find_one({"name": "Admin", "is_deleted": False})
    programs_view = await Permission.find_one({"code": "programs.view"})
    # Put the role back to before it was granted the permission.
    admin.permission_ids = [pid for pid in admin.permission_ids if pid != programs_view.id]
    await admin.save()

    granted = await backfill_role_permissions()

    assert granted >= 1
    restored = await Role.find_one({"name": "Admin", "is_deleted": False})
    assert programs_view.id in restored.permission_ids


async def test_paying_amount_and_qr_code_round_trip(client, auth_headers):
    """The two manual payment-tracking columns on the board. Written by an
    inline cell, so nothing else validates them on the way in."""
    lead = (
        await client.post(
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": "Nirmal Raj", "phone": "8760875793"},
        )
    ).json()

    updated = await client.put(
        f"/api/v1/leads/{lead['id']}",
        headers=auth_headers,
        json={"paying_amount": "24500.50", "qr_code": "Chitra-Axis"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["paying_amount"] == "24500.50"
    assert updated.json()["qr_code"] == "Chitra-Axis"

    # Both clear back to unset - a value picked by mistake has to come off.
    cleared = await client.put(
        f"/api/v1/leads/{lead['id']}",
        headers=auth_headers,
        json={"paying_amount": None, "qr_code": None},
    )
    assert cleared.json()["paying_amount"] is None
    assert cleared.json()["qr_code"] is None


async def test_paying_amount_rejects_a_negative(client, auth_headers):
    lead = (
        await client.post(
            "/api/v1/leads", headers=auth_headers, json={"name": "Nirmal Raj", "phone": "8760875793"}
        )
    ).json()

    response = await client.put(
        f"/api/v1/leads/{lead['id']}", headers=auth_headers, json={"paying_amount": "-1"}
    )
    assert response.status_code == 422
