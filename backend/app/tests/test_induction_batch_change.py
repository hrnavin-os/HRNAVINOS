"""Tests for changing a student's batch on the Induction board: an existing
batch can only be changed with a reason, and the reason is kept on the entry
so the board can print it under the batch."""
from app.tests.test_induction_section_field import SUBMIT_URL, entry_for, make_section_admin, payload

ENTRIES_URL = "/api/v1/induction-entries"


async def seed_entry(client, auth_headers, **overrides) -> dict:
    await make_section_admin("a", "sec.a@hrnavinos.com")
    response = await client.post(SUBMIT_URL, json=payload(section="A Section", **overrides))
    assert response.status_code == 201, response.text
    return await entry_for(client, auth_headers, "Arun")


async def test_changing_the_batch_without_a_reason_is_refused(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers, batch="30")

    response = await client.put(f"{ENTRIES_URL}/{entry['id']}", headers=auth_headers, json={"batch_number": 31})

    assert response.status_code == 400
    assert "Batch-30" in response.json()["message"]
    # Nothing half-applied: the batch is still the one it was.
    assert (await entry_for(client, auth_headers, "Arun"))["batch"] == "Batch-30"


async def test_a_blank_reason_counts_as_none(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers, batch="30")

    response = await client.put(
        f"{ENTRIES_URL}/{entry['id']}",
        headers=auth_headers,
        json={"batch_number": 31, "batch_change_reason": "   "},
    )

    assert response.status_code == 400


async def test_a_change_with_a_reason_is_saved_and_kept(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers, batch="30")

    response = await client.put(
        f"{ENTRIES_URL}/{entry['id']}",
        headers=auth_headers,
        json={"batch_number": 31, "batch_change_reason": "  Missed the first week, joining the next batch  "},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["batch"] == "Batch-31"
    [change] = body["batch_history"]
    assert change["from_batch"] == 30
    assert change["to_batch"] == 31
    assert change["reason"] == "Missed the first week, joining the next batch"
    assert change["by_name"]
    # And on the board's list, which is where it is printed.
    assert (await entry_for(client, auth_headers, "Arun"))["batch_history"][0]["reason"] == change["reason"]


async def test_changes_are_kept_oldest_first(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers, batch="30")
    for number, reason in ((31, "First move"), (32, "Second move")):
        response = await client.put(
            f"{ENTRIES_URL}/{entry['id']}",
            headers=auth_headers,
            json={"batch_number": number, "batch_change_reason": reason},
        )
        assert response.status_code == 200, response.text

    history = (await entry_for(client, auth_headers, "Arun"))["batch_history"]
    assert [(change["from_batch"], change["to_batch"], change["reason"]) for change in history] == [
        (30, 31, "First move"),
        (31, 32, "Second move"),
    ]


async def test_resaving_the_same_batch_needs_no_reason(client, seeded, auth_headers):
    """The edit form sends every field it holds, so a save that only fixed the
    email still carries the batch - and that isn't a change."""
    entry = await seed_entry(client, auth_headers, batch="30")

    response = await client.put(
        f"{ENTRIES_URL}/{entry['id']}",
        headers=auth_headers,
        json={"batch_number": 30, "email": "arun@example.com"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["batch_history"] == []


async def test_setting_a_first_batch_needs_no_reason(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers)

    response = await client.put(f"{ENTRIES_URL}/{entry['id']}", headers=auth_headers, json={"batch_number": 30})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["batch"] == "Batch-30"
    assert body["batch_history"] == []


async def test_a_reason_without_a_change_is_ignored(client, seeded, auth_headers):
    entry = await seed_entry(client, auth_headers, batch="30")

    response = await client.put(
        f"{ENTRIES_URL}/{entry['id']}",
        headers=auth_headers,
        json={"name": "Arun Kumar", "batch_change_reason": "Nothing moved"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["batch_history"] == []
