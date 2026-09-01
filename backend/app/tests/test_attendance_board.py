"""Tests for the induction Attendance board.

The board lists induction entries, so every test here seeds one. Distinct from
the classroom attendance a Tutor marks against a batch.
"""

INDUCTION_URL = "/api/v1/induction-entries"
STUDENTS_URL = "/api/v1/induction-attendance/students"
STATS_URL = "/api/v1/induction-attendance/stats"
DOCUMENT_URL = "/api/v1/induction-attendance/terms-document"

FOUNDATION_URL = "/api/v1/public/foundation-form/submit"


async def add_student(client, auth_headers, *, name: str = "Arun", phone: str = "9876543210") -> str:
    response = await client.post(
        INDUCTION_URL,
        headers=auth_headers,
        json={
            "name": name,
            "phone": phone,
            "registration_date": "2026-08-04",
            "sales_person": "Priya",
            "lead_source": "Instagram",
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def mark(client, auth_headers, entry_id: str, marker: str, marked):
    return await client.put(
        f"{STUDENTS_URL}/{entry_id}/marks/{marker}", headers=auth_headers, json={"marked": marked}
    )


async def test_all_students_lists_the_induction_roll_unmarked(client, auth_headers):
    await add_student(client, auth_headers, name="Arun", phone="9876543210")
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    body = (await client.get(STUDENTS_URL, headers=auth_headers)).json()
    assert body["total"] == 2
    # Every marker travels on every row, and nothing has been marked yet.
    for row in body["items"]:
        assert set(row["marks"]) == {"terms", "polls", "success_meet", "foundation_class"}
        assert all(mark["marked"] is False for mark in row["marks"].values())


async def test_each_marker_splits_the_roll_independently(client, auth_headers):
    arun = await add_student(client, auth_headers)
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    assert (await mark(client, auth_headers, arun, "polls", True)).status_code == 200

    selected = await client.get(
        STUDENTS_URL, headers=auth_headers, params={"marker": "polls", "state": "yes"}
    )
    assert [row["id"] for row in selected.json()["items"]] == [arun]

    pending = await client.get(
        STUDENTS_URL, headers=auth_headers, params={"marker": "polls", "state": "no"}
    )
    assert [row["name"] for row in pending.json()["items"]] == ["Divya"]

    # Marking the poll says nothing about the success meet.
    meet = await client.get(
        STUDENTS_URL, headers=auth_headers, params={"marker": "success_meet", "state": "yes"}
    )
    assert meet.json()["total"] == 0


async def test_a_mark_records_who_made_it_and_clearing_removes_them(client, auth_headers):
    entry_id = await add_student(client, auth_headers)

    marked = await mark(client, auth_headers, entry_id, "success_meet", True)
    assert marked.json()["marks"]["success_meet"]["marked"] is True
    assert marked.json()["marks"]["success_meet"]["source"] == "manual"
    assert marked.json()["marks"]["success_meet"]["by_name"]

    cleared = await mark(client, auth_headers, entry_id, "success_meet", None)
    assert cleared.json()["marks"]["success_meet"]["marked"] is False
    # A cleared marker has no answer, so it has nobody vouching for one.
    assert cleared.json()["marks"]["success_meet"]["source"] == "none"
    assert cleared.json()["marks"]["success_meet"]["by_name"] is None


async def test_foundation_class_is_answered_by_the_foundation_link(client, auth_headers):
    """Nobody ticks the common case: an induction entry that reached a
    Foundation Form submission got there through the foundation class, and the
    link is already made on mobile-number match."""
    entry_id = await add_student(client, auth_headers, phone="9876543210")
    # The pricing endpoint lazily seeds the programs a submission validates
    # program_interest against.
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200
    submitted = await client.post(
        FOUNDATION_URL,
        json={
            "name": "Arun Kumar",
            "mobile_number": "9876543210",
            "email": "arun@example.com",
            "program_interest": "only_recruitment",
            "payment_timeline": "immediate",
            "queries": "None",
        },
    )
    assert submitted.status_code in (200, 201), submitted.text

    attended = await client.get(
        STUDENTS_URL, headers=auth_headers, params={"marker": "foundation_class", "state": "yes"}
    )
    assert [row["id"] for row in attended.json()["items"]] == [entry_id]
    assert attended.json()["items"][0]["marks"]["foundation_class"]["source"] == "auto"


async def test_a_manual_no_overrides_the_automatic_foundation_answer(client, auth_headers):
    entry_id = await add_student(client, auth_headers, phone="9876543210")
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200
    await client.post(
        FOUNDATION_URL,
        json={
            "name": "Arun Kumar",
            "mobile_number": "9876543210",
            "email": "arun@example.com",
            "program_interest": "only_recruitment",
            "payment_timeline": "immediate",
            "queries": "None",
        },
    )

    corrected = await mark(client, auth_headers, entry_id, "foundation_class", False)
    assert corrected.json()["marks"]["foundation_class"]["marked"] is False
    assert corrected.json()["marks"]["foundation_class"]["source"] == "manual"

    # And the correction moves them across the tab, not just on their own row.
    pending = await client.get(
        STUDENTS_URL, headers=auth_headers, params={"marker": "foundation_class", "state": "no"}
    )
    assert [row["id"] for row in pending.json()["items"]] == [entry_id]

    # Clearing hands them back to what the Foundation link says.
    restored = await mark(client, auth_headers, entry_id, "foundation_class", None)
    assert restored.json()["marks"]["foundation_class"]["marked"] is True
    assert restored.json()["marks"]["foundation_class"]["source"] == "auto"


async def test_stats_cover_every_marker(client, auth_headers):
    entry_id = await add_student(client, auth_headers)
    await add_student(client, auth_headers, name="Divya", phone="9876500000")
    await mark(client, auth_headers, entry_id, "terms", True)

    stats = (await client.get(STATS_URL, headers=auth_headers)).json()
    assert stats["total"] == 2
    assert set(stats["markers"]) == {"terms", "polls", "success_meet", "foundation_class"}
    assert stats["markers"]["terms"] == {"total": 2, "yes": 1, "no": 1}
    # Every marker's two sides add back up to the roll.
    for split in stats["markers"].values():
        assert split["yes"] + split["no"] == split["total"] == 2


async def test_the_induction_update_form_and_the_terms_tab_write_the_same_field(client, auth_headers):
    """Page four of the update form has always carried the terms tick. The
    board reads that field rather than one of its own, so a signature recorded
    on either surface is visible on both."""
    entry_id = await add_student(client, auth_headers)

    await client.put(
        f"{INDUCTION_URL}/{entry_id}/details",
        headers=auth_headers,
        json={"other_details": {"terms_form_signed": True}},
    )

    signed = await client.get(STUDENTS_URL, headers=auth_headers, params={"marker": "terms", "state": "yes"})
    assert [row["id"] for row in signed.json()["items"]] == [entry_id]
    # And the tick made over there is attributed here too.
    assert signed.json()["items"][0]["marks"]["terms"]["by_name"]


async def test_search_narrows_the_board(client, auth_headers):
    await add_student(client, auth_headers, name="Arun", phone="9876543210")
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    found = await client.get(STUDENTS_URL, headers=auth_headers, params={"search": "Divya"})
    assert [row["name"] for row in found.json()["items"]] == ["Divya"]


async def test_search_and_a_marker_filter_apply_together(client, auth_headers):
    """The foundation marker's query is an `$or`, and so is search - one would
    silently replace the other if they weren't kept apart."""
    arun = await add_student(client, auth_headers, name="Arun", phone="9876543210")
    await add_student(client, auth_headers, name="Divya", phone="9876500000")
    await mark(client, auth_headers, arun, "foundation_class", True)

    found = await client.get(
        STUDENTS_URL,
        headers=auth_headers,
        params={"marker": "foundation_class", "state": "yes", "search": "Divya"},
    )
    # Divya has not attended, so narrowing the attended tab to her finds
    # nobody - rather than search widening the tab back to the whole roll.
    assert found.json()["total"] == 0


async def test_unknown_marker_is_rejected(client, auth_headers):
    response = await client.get(STUDENTS_URL, headers=auth_headers, params={"marker": "nonsense"})
    assert response.status_code == 422


async def test_document_is_created_empty_and_then_edited(client, auth_headers):
    first = await client.get(DOCUMENT_URL, headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["body"] == ""

    saved = await client.put(
        DOCUMENT_URL,
        headers=auth_headers,
        json={"title": "HRNAVINOS Terms", "body": "1. Attend every session.\n2. Pay on time."},
    )
    assert saved.status_code == 200
    assert saved.json()["title"] == "HRNAVINOS Terms"
    assert saved.json()["updated_by_name"]

    # Singleton: a second read returns the edit rather than a fresh blank one.
    again = await client.get(DOCUMENT_URL, headers=auth_headers)
    assert again.json()["body"].startswith("1. Attend every session.")
