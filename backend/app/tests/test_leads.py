"""Tests for the Lead Management (CRM / Pre-Sales) module."""
from datetime import datetime, timezone
from decimal import Decimal

from app.models.lead import Lead


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


async def make_lead_dated(client, auth_headers, *, name: str, phone: str, day: int) -> str:
    """A lead whose Foundation Form landed on a given day of the month.

    Backdated on the document rather than through the API: created_at is set at
    insert time, so every lead a test creates would otherwise fall in whichever
    half of the month the suite happens to run in.
    """
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": name, "phone": phone, "course_interest": "Data Science"},
    )
    assert create.status_code == 201, create.text
    lead = await Lead.get(create.json()["id"])
    lead.created_at = datetime(2026, 8, day, 10, 0, tzinfo=timezone.utc)
    await lead.save()
    return str(lead.id)


async def test_a_lead_carries_the_foundation_class_it_came_through(client, auth_headers):
    """The foundation class runs twice a month: the 1st-15th is Group 1, the
    16th onward Group 2. Derived from the day the form landed, never stored."""
    await make_lead_dated(client, auth_headers, name="Arun", phone="9876543210", day=4)
    await make_lead_dated(client, auth_headers, name="Divya", phone="9876500000", day=15)
    await make_lead_dated(client, auth_headers, name="Bala", phone="9876511111", day=16)

    rows = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"]
    assert {row["name"]: row["foundation_group"] for row in rows} == {"Arun": 1, "Divya": 1, "Bala": 2}


async def test_foundation_group_filter_splits_the_board(client, auth_headers):
    await make_lead_dated(client, auth_headers, name="Arun", phone="9876543210", day=4)
    await make_lead_dated(client, auth_headers, name="Bala", phone="9876511111", day=20)

    first = await client.get("/api/v1/leads", headers=auth_headers, params={"foundation_group": 1})
    assert [row["name"] for row in first.json()["items"]] == ["Arun"]

    second = await client.get("/api/v1/leads", headers=auth_headers, params={"foundation_group": 2})
    assert [row["name"] for row in second.json()["items"]] == ["Bala"]


async def test_foundation_group_and_date_range_both_apply(client, auth_headers):
    """Both narrow created_at. Composed rather than merged, or the last one
    written would quietly replace the other."""
    await make_lead_dated(client, auth_headers, name="Arun", phone="9876543210", day=4)
    await make_lead_dated(client, auth_headers, name="Bala", phone="9876511111", day=20)
    await make_lead_dated(client, auth_headers, name="Chitra", phone="9876522222", day=25)

    response = await client.get(
        "/api/v1/leads",
        headers=auth_headers,
        params={"foundation_group": 2, "date_from": "2026-08-21", "date_to": "2026-08-31"},
    )
    assert [row["name"] for row in response.json()["items"]] == ["Chitra"]
# --------------------------------------------------------------------------
# Statistics board - the Foundation half
# --------------------------------------------------------------------------
ANALYTICS_URL = "/api/v1/leads/analytics"


async def make_lead(client, auth_headers, *, name: str, phone: str, when: datetime | None = None, **fields):
    """A Foundation lead with whatever state a breakdown needs to be counted.

    Written onto the document rather than through the API: the stages this
    board counts (Batch Confirmation, Lost) are pipeline gates that can only be
    entered in order and only once money is behind them, and created_at is
    stamped at insert time - so a test that had to go through the front door
    could only ever produce new leads created today.
    """
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": name,
            "phone": phone,
            "course_interest": fields.pop("course_interest", "Data Science"),
        },
    )
    assert create.status_code == 201, create.text
    lead = await Lead.get(create.json()["id"])
    if when is not None:
        lead.created_at = when
    for key, value in fields.items():
        setattr(lead, key, value)
    await lead.save()
    return lead


async def analytics(client, auth_headers, dimension: str, **params) -> dict:
    response = await client.get(
        ANALYTICS_URL, headers=auth_headers, params={"dimension": dimension, **params}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_foundation_analytics_counts_confirmations_and_losses(client, auth_headers):
    """A bare count per course answers nothing useful - how many of them
    reached Batch Confirmation and how many were lost is the question the
    board exists for."""
    await make_lead(client, auth_headers, name="Arun", phone="9000000101", status="batch_confirmation")
    await make_lead(client, auth_headers, name="Bala", phone="9000000102", status="lost")
    await make_lead(
        client, auth_headers, name="Chitra", phone="9000000103", course_interest="Full Stack"
    )

    data = await analytics(client, auth_headers, "course")

    assert data["total"] == 3
    by_value = {item["value"]: item for item in data["items"]}
    assert by_value["Data Science"]["count"] == 2
    assert by_value["Data Science"]["confirmed"] == 1
    assert by_value["Data Science"]["lost"] == 1
    assert by_value["Full Stack"]["count"] == 1


async def test_foundation_analytics_sums_what_was_collected(client, auth_headers):
    """The Foundation board's own measure: money actually typed against the
    leads under a value, not just how many of them there are."""
    await make_lead(
        client, auth_headers, name="Arun", phone="9000000101", paying_amount=Decimal("10000")
    )
    await make_lead(
        client, auth_headers, name="Bala", phone="9000000102", paying_amount=Decimal("5500.50")
    )
    # No amount typed against this one - it contributes nothing rather than
    # breaking the sum.
    await make_lead(client, auth_headers, name="Chitra", phone="9000000103")

    data = await analytics(client, auth_headers, "course")

    assert data["items"][0]["collected"] == 15500.5


async def test_foundation_analytics_names_the_leads_with_no_value(client, auth_headers):
    """How much of the data is missing is itself a finding, so those leads are
    a named row rather than quietly dropped."""
    await make_lead(client, auth_headers, name="Arun", phone="9000000101")

    data = await analytics(client, auth_headers, "payment_plan")

    assert [item["value"] for item in data["items"]] == ["Not set"]
    assert data["items"][0]["count"] == 1


async def test_foundation_analytics_leaves_out_leads_still_in_form_check(client, auth_headers):
    """An imported row waiting to be checked isn't a lead yet, and the board
    doesn't count it - or the summary would disagree with the board it
    summarises."""
    await make_lead(client, auth_headers, name="Arun", phone="9000000101")
    await make_lead(client, auth_headers, name="Unchecked", phone="9000000102", reviewed=False)

    assert (await analytics(client, auth_headers, "course"))["total"] == 1


async def test_foundation_analytics_groups_by_batch_and_names_the_month(client, auth_headers):
    """The batch IS the month the form landed in, so the rows are named for the
    batch and carry the month that says which one it was."""
    august = datetime(2026, 8, 4, 10, 0, tzinfo=timezone.utc)
    await make_lead(client, auth_headers, name="Arun", phone="9000000101", when=august)
    await make_lead(client, auth_headers, name="Bala", phone="9000000102", when=august)
    await make_lead(
        client,
        auth_headers,
        name="Chitra",
        phone="9000000103",
        when=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
    )

    data = await analytics(client, auth_headers, "batch")

    by_value = {item["value"]: item for item in data["items"]}
    assert by_value["Batch-28"]["count"] == 2
    assert by_value["Batch-28"]["period"] == "Aug 2026"
    assert by_value["Batch-28"]["start"] == "2026-08-01"
    assert by_value["Batch-30"]["count"] == 1
    # Biggest first, like every other dimension - the chronological views sort
    # on `start` themselves.
    assert data["items"][0]["value"] == "Batch-28"


async def test_foundation_analytics_fills_in_a_month_nobody_came_through(client, auth_headers):
    """A gap in the intake is a finding. Left out, a chart draws a straight
    line across the missing month and says the opposite."""
    await make_lead(
        client,
        auth_headers,
        name="Arun",
        phone="9000000101",
        when=datetime(2026, 8, 4, 10, 0, tzinfo=timezone.utc),
    )
    await make_lead(
        client,
        auth_headers,
        name="Chitra",
        phone="9000000103",
        when=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
    )

    data = await analytics(client, auth_headers, "batch")

    by_value = {item["value"]: item for item in data["items"]}
    assert set(by_value) == {"Batch-28", "Batch-29", "Batch-30"}
    assert by_value["Batch-29"]["count"] == 0
    # The empty month is still a month, so it still says which one.
    assert by_value["Batch-29"]["period"] == "Sep 2026"


async def test_foundation_analytics_window_narrows_the_population(client, auth_headers):
    """Both ends inclusive, and the far end takes in its whole day - leads carry
    a timestamp, so a midnight bound would drop everything that arrived after
    00:00 on the last day of the window."""
    await make_lead(
        client,
        auth_headers,
        name="Arun",
        phone="9000000101",
        when=datetime(2026, 8, 31, 18, 30, tzinfo=timezone.utc),
    )
    await make_lead(
        client,
        auth_headers,
        name="Chitra",
        phone="9000000103",
        when=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
    )

    data = await analytics(
        client, auth_headers, "course", date_from="2026-08-01", date_to="2026-08-31"
    )

    assert data["total"] == 1


async def test_foundation_analytics_refuses_an_unknown_dimension(client, auth_headers):
    """The field is looked up in a closed map, so no caller can group the
    collection by an arbitrary field."""
    response = await client.get(ANALYTICS_URL, headers=auth_headers, params={"dimension": "phone"})
    assert response.status_code == 422


async def test_delete_lead_takes_it_off_the_board(client, auth_headers):
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )
    lead_id = create.json()["id"]

    deleted = await client.delete(f"/api/v1/leads/{lead_id}", headers=auth_headers)
    assert deleted.status_code == 200

    listing = await client.get("/api/v1/leads", headers=auth_headers)
    assert [row["id"] for row in listing.json()["items"]] == []
    # Soft delete: the record is kept, it has just left the board.
    assert (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).status_code == 404


async def _lost_lead(client, auth_headers) -> str:
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Ravi Kumar", "phone": "9876543210", "course_interest": "Data Science"},
    )
    lead_id = create.json()["id"]
    lost = await client.put(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers,
        json={"status": "lost", "lost_reason": "Joined elsewhere"},
    )
    assert lost.status_code == 200
    return lead_id


async def test_rejoin_returns_a_lost_lead_on_the_chosen_course(client, auth_headers):
    lead_id = await _lost_lead(client, auth_headers)

    response = await client.post(
        f"/api/v1/leads/{lead_id}/rejoin", headers=auth_headers, json={"course_interest": "Recruitment"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "new_lead"
    assert body["course_interest"] == "Recruitment"
    # The loss no longer stands, so nothing is left saying it does.
    assert body["lost_reason"] is None
    assert body["lost_at"] is None

    timeline = await client.get(f"/api/v1/leads/{lead_id}/timeline", headers=auth_headers)
    assert "REJOIN" in {entry["action"] for entry in timeline.json()}


async def test_rejoin_keeps_what_the_student_already_paid(client, auth_headers):
    lead_id = await _lost_lead(client, auth_headers)
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"paying_amount": 5000})

    response = await client.post(
        f"/api/v1/leads/{lead_id}/rejoin", headers=auth_headers, json={"course_interest": "Data Science"}
    )
    assert response.json()["paying_amount"] == "5000"


async def test_only_a_lost_lead_can_rejoin(client, auth_headers):
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Active Lead", "phone": "9000044444", "course_interest": "Data Science"},
    )

    response = await client.post(
        f"/api/v1/leads/{create.json()['id']}/rejoin",
        headers=auth_headers,
        json={"course_interest": "Recruitment"},
    )
    assert response.status_code == 400


async def test_a_section_admin_can_create_a_lead_onto_their_own_section(client, auth_headers):
    """The walk-in and the phone enquiry are a Section Admin's case more than
    anybody's - they are the one on the call - so the role is granted
    leads.create. It doesn't widen their reach: whatever section the client
    sends, the lead lands on the board they are already scoped to."""
    from app.core.security import hash_password
    from app.models.permission import Permission
    from app.models.role import Role
    from app.models.user import User

    role = await Role.find_one({"name": "A-Section Admin", "is_deleted": False})
    leads_create = await Permission.find_one({"code": "leads.create"})
    assert leads_create.id in role.permission_ids, "a Section Admin can no longer create a lead"

    await User(
        email="a.section@example.com",
        first_name="Rubika",
        last_name="A",
        password_hash=hash_password("Sect!on123"),
        role_id=role.id,
        is_active=True,
    ).insert()
    login = await client.post(
        "/api/v1/auth/login", json={"email": "a.section@example.com", "password": "Sect!on123"}
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = await client.post(
        "/api/v1/leads",
        headers=headers,
        json={
            "name": "Walk In",
            "phone": "9000000001",
            "course_interest": "Recruitment + Internship",
            # A section they are not scoped to, to prove it is ignored.
            "section": "c",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["section"] == "a"
