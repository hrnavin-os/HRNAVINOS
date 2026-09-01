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
            json={"name": "Nirmal Raj", "phone": "8760875793", "course_interest": "Recruitment + Internship"},
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
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": "Nirmal Raj", "phone": "8760875793", "course_interest": "Recruitment + Internship"},
        )
    ).json()

    response = await client.put(
        f"/api/v1/leads/{lead['id']}", headers=auth_headers, json={"paying_amount": "-1"}
    )
    assert response.status_code == 422


async def _lead_id(client, auth_headers, name: str = "Remark Lead", phone: str = "9000000001") -> str:
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": name, "phone": phone, "course_interest": "Data Science"},
    )
    return create.json()["id"]


async def test_add_dated_remarks_returns_newest_day_first(client, auth_headers):
    lead_id = await _lead_id(client, auth_headers)

    await client.post(
        f"/api/v1/leads/{lead_id}/remarks",
        headers=auth_headers,
        json={"remark_date": "2026-08-20", "text": "Called, asked to ring back"},
    )
    response = await client.post(
        f"/api/v1/leads/{lead_id}/remarks",
        headers=auth_headers,
        json={"remark_date": "2026-08-22", "text": "Confirmed she will pay Friday"},
    )

    assert response.status_code == 201
    entries = response.json()["remark_entries"]
    assert [entry["remark_date"] for entry in entries] == ["2026-08-22", "2026-08-20"]
    assert entries[0]["created_by_name"]
    # The legacy single-text field mirrors the most recent remark, so anything
    # still reading it sees the current note rather than a stale one.
    assert response.json()["remarks"] == "Confirmed she will pay Friday"


async def test_remark_defaults_to_today(client, auth_headers):
    from app.database.base import utcnow

    lead_id = await _lead_id(client, auth_headers, phone="9000000002")
    response = await client.post(
        f"/api/v1/leads/{lead_id}/remarks", headers=auth_headers, json={"text": "No date given"}
    )
    assert response.json()["remark_entries"][0]["remark_date"] == utcnow().date().isoformat()


async def test_edit_and_delete_remark(client, auth_headers):
    lead_id = await _lead_id(client, auth_headers, phone="9000000003")
    created = await client.post(
        f"/api/v1/leads/{lead_id}/remarks",
        headers=auth_headers,
        json={"remark_date": "2026-08-20", "text": "Typo"},
    )
    remark_id = created.json()["remark_entries"][0]["id"]

    edited = await client.put(
        f"/api/v1/leads/{lead_id}/remarks/{remark_id}",
        headers=auth_headers,
        json={"text": "Fixed", "remark_date": "2026-08-21"},
    )
    assert edited.status_code == 200
    entry = edited.json()["remark_entries"][0]
    assert (entry["text"], entry["remark_date"]) == ("Fixed", "2026-08-21")
    assert entry["updated_at"]

    deleted = await client.delete(f"/api/v1/leads/{lead_id}/remarks/{remark_id}", headers=auth_headers)
    assert deleted.status_code == 200
    # Deleting the last remark clears the mirror too - otherwise the row would
    # keep showing a note that was just removed.
    assert deleted.json()["remark_entries"] == []
    assert deleted.json()["remarks"] is None


async def test_legacy_remark_is_surfaced_then_migrated(client, auth_headers):
    lead_id = await _lead_id(client, auth_headers, phone="9000000004")
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"remarks": "Written before dates"})

    # Shown as a read-only, id-less entry so pre-existing notes stay visible.
    listed = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert len(listed["remark_entries"]) == 1
    assert listed["remark_entries"][0]["id"] is None

    after = await client.post(
        f"/api/v1/leads/{lead_id}/remarks",
        headers=auth_headers,
        json={"remark_date": "2026-08-25", "text": "New dated note"},
    )
    entries = after.json()["remark_entries"]
    # The old note becomes a real entry rather than being dropped.
    assert len(entries) == 2
    assert all(entry["id"] for entry in entries)
    assert {entry["text"] for entry in entries} == {"Written before dates", "New dated note"}


async def test_blank_remark_is_rejected(client, auth_headers):
    lead_id = await _lead_id(client, auth_headers, phone="9000000005")
    response = await client.post(f"/api/v1/leads/{lead_id}/remarks", headers=auth_headers, json={"text": "   "})
    assert response.status_code == 400
