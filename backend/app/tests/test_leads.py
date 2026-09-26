"""Tests for the Lead Management (CRM / Pre-Sales) module."""
from datetime import date, datetime, timezone
from decimal import Decimal

from app.models.induction_entry import InductionEntry
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


async def test_filter_leads_by_qr_code(client, auth_headers):
    """The QR Code filter: everyone who paid into one account, and nobody on
    another account or with no account picked yet."""
    ids = []
    for name, phone in (("On Axis", "1111111111"), ("On Gold", "2222222222"), ("No QR", "3333333333")):
        created = await client.post(
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": name, "phone": phone, "course_interest": "Data Science"},
        )
        ids.append(created.json()["id"])
    await client.put(f"/api/v1/leads/{ids[0]}", headers=auth_headers, json={"qr_code": "Chitra-Axis"})
    await client.put(f"/api/v1/leads/{ids[1]}", headers=auth_headers, json={"qr_code": "Raja Gold"})

    response = await client.get("/api/v1/leads", headers=auth_headers, params={"qr_code": "Chitra-Axis"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == ids[0]


async def test_stat_cards_follow_the_board_filters(client, auth_headers):
    """The cards above the Foundation board count what the filter row leaves
    in the table - the total, each section and Lost alike - rather than the
    whole board whatever is picked."""
    ids = []
    for name, phone, section in (
        ("A Axis", "1111111111", "a"),
        ("B Axis", "2222222222", "b"),
        ("B Gold", "3333333333", "b"),
    ):
        created = await client.post(
            "/api/v1/leads",
            headers=auth_headers,
            json={"name": name, "phone": phone, "course_interest": "Data Science", "section": section},
        )
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])
    for lead_id, qr in zip(ids, ("Chitra-Axis", "Chitra-Axis", "Raja Gold")):
        await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"qr_code": qr})

    unfiltered = (await client.get("/api/v1/leads/stats", headers=auth_headers)).json()
    assert unfiltered["total"] == 3
    assert unfiltered["by_section"] == {"a": 1, "b": 2}

    filtered = await client.get("/api/v1/leads/stats", headers=auth_headers, params={"qr_code": "Chitra-Axis"})
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 2
    assert body["by_section"] == {"a": 1, "b": 1}

    # The search box narrows them the same way the table's does.
    searched = (
        await client.get("/api/v1/leads/stats", headers=auth_headers, params={"search": "gold"})
    ).json()
    assert searched["total"] == 1
    assert searched["by_section"] == {"b": 1}


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


async def test_admin_head_keeps_the_programs_tab_on_an_existing_database(client, auth_headers):
    """DEFAULT_ROLE_PERMISSIONS is a seed, not a migration: adding a permission
    to a role there changes what a fresh database gets and leaves every
    existing one as it was. The startup backfill closes that gap, which is the
    only reason the Programs tab appears for an Admin who was created before
    the role gained it."""
    from app.database.backfills import backfill_role_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    admin = await Role.find_one({"name": "Admin Head", "is_deleted": False})
    programs_view = await Permission.find_one({"code": "programs.view"})
    # Put the role back to before it was granted the permission.
    admin.permission_ids = [pid for pid in admin.permission_ids if pid != programs_view.id]
    await admin.save()

    granted = await backfill_role_permissions()

    assert granted >= 1
    restored = await Role.find_one({"name": "Admin Head", "is_deleted": False})
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


async def make_lead_in_group(client, auth_headers, *, name: str, phone: str, group: int | None) -> str:
    """A Foundation lead put into a foundation class group.

    Through the API, not by writing the document: the group is a decision
    somebody makes, and the point of these tests is that it stays whatever they
    said - which is only true if it goes in the way the board sends it.
    """
    create = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": name, "phone": phone, "course_interest": "Data Science"},
    )
    assert create.status_code == 201, create.text
    lead_id = create.json()["id"]
    if group is not None:
        response = await client.put(
            f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"foundation_group": group}
        )
        assert response.status_code == 200, response.text
    return lead_id


async def test_a_lead_carries_the_group_it_was_put_in(client, auth_headers):
    """The group is recorded, not read off the calendar. Two leads created in
    the same minute can sit in different groups, which is the whole reason it
    stopped being derived from created_at."""
    await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=1)
    await make_lead_in_group(client, auth_headers, name="Divya", phone="9876500000", group=1)
    await make_lead_in_group(client, auth_headers, name="Bala", phone="9876511111", group=3)

    rows = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"]
    assert {row["name"]: row["foundation_group"] for row in rows} == {"Arun": 1, "Divya": 1, "Bala": 3}


async def test_a_lead_with_no_group_yet_says_so(client, auth_headers):
    """Rather than being filed into Group 1 by default. Nobody has decided, and
    a board that guessed would send somebody to the wrong class."""
    await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=None)

    rows = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"]
    assert rows[0]["foundation_group"] is None
    assert rows[0]["foundation_group_history"] == []


async def test_foundation_group_filter_splits_the_board(client, auth_headers):
    await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=1)
    await make_lead_in_group(client, auth_headers, name="Bala", phone="9876511111", group=2)

    first = await client.get("/api/v1/leads", headers=auth_headers, params={"foundation_group": 1})
    assert [row["name"] for row in first.json()["items"]] == ["Arun"]

    second = await client.get("/api/v1/leads", headers=auth_headers, params={"foundation_group": 2})
    assert [row["name"] for row in second.json()["items"]] == ["Bala"]


async def test_moving_a_lead_between_groups_is_written_down(client, auth_headers):
    """The board has to be able to say a student was moved, not only where they
    ended up - a roll printed last week is wrong the moment somebody moves."""
    lead_id = await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=1)
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"foundation_group": 2})

    row = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert row["foundation_group"] == 2
    # Being put into a group in the first place is recorded too, so the trail
    # reads from nothing, to 1, to 2.
    assert [(move["from_group"], move["to_group"]) for move in row["foundation_group_history"]] == [
        (None, 1),
        (1, 2),
    ]


async def test_a_direct_group_change_is_marked_direct(client, auth_headers):
    """Group 1 to Group 3 "directly" is still written down, but flagged so the
    board shows no "moved from Group 1" under it."""
    lead_id = await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=1)
    response = await client.put(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers,
        json={"foundation_group": 3, "foundation_group_direct": True},
    )
    assert response.status_code == 200

    row = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert row["foundation_group"] == 3
    assert [
        (move["from_group"], move["to_group"], move["direct"]) for move in row["foundation_group_history"]
    ] == [(None, 1, False), (1, 3, True)]


async def test_restating_the_same_group_records_no_move(client, auth_headers):
    """Saving the row again shouldn't say the student was moved from Group 2
    to Group 2 - the cell would then claim a move that never happened."""
    lead_id = await make_lead_in_group(client, auth_headers, name="Arun", phone="9876543210", group=2)
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"foundation_group": 2})

    row = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert len(row["foundation_group_history"]) == 1


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


async def induction_entry(batch: int | None) -> InductionEntry:
    entry = InductionEntry(
        name="Induction", phone="9000009999", registration_date=date(2026, 8, 4), batch_number=batch
    )
    await entry.insert()
    return entry


async def test_foundation_analytics_groups_by_the_induction_batch(client, auth_headers):
    """A lead is counted in the batch entered on its Induction form, whatever
    month it arrived in - and that number beats anything typed on the lead."""
    twenty = await induction_entry(20)
    await make_lead(client, auth_headers, name="Arun", phone="9000000101", induction_entry_id=twenty.id)
    await make_lead(
        client,
        auth_headers,
        name="Bala",
        phone="9000000102",
        induction_entry_id=twenty.id,
        batch_number="21",
        when=datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc),
    )
    # Never came through Induction, so the typed batch is used.
    await make_lead(client, auth_headers, name="Chitra", phone="9000000103", batch_number="20")
    await make_lead(client, auth_headers, name="Devi", phone="9000000104")

    data = await analytics(client, auth_headers, "batch")

    by_value = {item["value"]: item for item in data["items"]}
    assert set(by_value) == {"Batch-20", "Not set"}
    assert by_value["Batch-20"]["count"] == 3
    assert by_value["Batch-20"]["order"] == 20
    assert by_value["Not set"]["order"] is None
    assert data["items"][0]["value"] == "Batch-20"


async def test_foundation_analytics_fills_in_a_batch_nobody_is_in(client, auth_headers):
    """A gap in the intake is a finding. Left out, a chart draws a straight
    line across the missing batch and says the opposite."""
    await make_lead(
        client, auth_headers, name="Arun", phone="9000000101", induction_entry_id=(await induction_entry(28)).id
    )
    await make_lead(
        client, auth_headers, name="Chitra", phone="9000000103", induction_entry_id=(await induction_entry(30)).id
    )

    data = await analytics(client, auth_headers, "batch")

    by_value = {item["value"]: item for item in data["items"]}
    assert set(by_value) == {"Batch-28", "Batch-29", "Batch-30"}
    assert by_value["Batch-29"]["count"] == 0


async def test_a_lead_shows_its_induction_batch(client, auth_headers):
    """The Induction form's batch is the lead's batch on every board."""
    lead = await make_lead(
        client,
        auth_headers,
        name="Arun",
        phone="9000000101",
        induction_entry_id=(await induction_entry(20)).id,
        batch_number="99",
    )
    typed = await make_lead(client, auth_headers, name="Bala", phone="9000000102", batch_number="7")

    shown = (await client.get(f"/api/v1/leads/{lead.id}", headers=auth_headers)).json()
    assert shown["batch"] == "Batch-20"
    assert shown["induction_batch"] == "Batch-20"
    assert (await client.get(f"/api/v1/leads/{typed.id}", headers=auth_headers)).json()["batch"] == "Batch-7"


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


async def test_a_renamed_section_admin_role_still_gets_new_permissions(client, auth_headers):
    """The backfill matches a seeded role by name, and the section admins'
    roles get renamed - the seed calls it "A-Section Admin" and the database
    in use calls it "Admin A-Section". A name lookup then matches nothing and
    the role silently stops receiving anything its definition gains, which is
    how Create Lead stayed missing from their board. The section is the stable
    identity, so that is what it falls back to."""
    from app.database.backfills import backfill_role_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    role = await Role.find_one({"name": "A-Section Admin", "is_deleted": False})
    leads_create = await Permission.find_one({"code": "leads.create"})
    # Put it back to a renamed role that never received the permission.
    role.name = "Admin A-Section"
    role.permission_ids = [pid for pid in role.permission_ids if pid != leads_create.id]
    await role.save()

    await backfill_role_permissions()

    restored = await Role.find_one({"name": "Admin A-Section", "is_deleted": False})
    assert restored.scoped_section == "a"
    assert leads_create.id in restored.permission_ids
