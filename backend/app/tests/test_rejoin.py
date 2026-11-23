"""The rejoin question on the Induction and Foundation forms: a tick and the old
batch number, shown as "Rejoin-30" after the name on both boards."""
import pytest

from app.tests.test_induction_foundation_link import (
    FOUNDATION_URL,
    INDUCTION_URL,
    foundation_payload,
    induction_payload,
    seed_programs,
)

REJOIN_30 = {"is_rejoin": True, "rejoin_batch": 30}


async def only_entry(client, auth_headers, status: str = "pending_induction") -> dict:
    listed = await client.get("/api/v1/induction-entries", headers=auth_headers, params={"status": status})
    [entry] = listed.json()["items"]
    return entry


async def only_lead(client, auth_headers) -> dict:
    [lead] = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"]
    return lead


async def test_induction_form_records_the_old_batch(client, auth_headers):
    assert (await client.post(INDUCTION_URL, json=induction_payload(**REJOIN_30))).status_code == 201
    assert (await only_entry(client, auth_headers))["rejoin_batch"] == 30


@pytest.mark.parametrize("answer", [{}, {"is_rejoin": False}, {"is_rejoin": False, "rejoin_batch": 30}])
async def test_an_unticked_box_is_not_a_rejoin(client, auth_headers, answer):
    assert (await client.post(INDUCTION_URL, json=induction_payload(**answer))).status_code == 201
    assert (await only_entry(client, auth_headers))["rejoin_batch"] is None


@pytest.mark.parametrize("batch", [None, 0, "abc"])
async def test_a_ticked_box_needs_a_real_batch_number(client, batch):
    await seed_programs(client)
    answer = {"is_rejoin": True, "rejoin_batch": batch}
    assert (await client.post(INDUCTION_URL, json=induction_payload(**answer))).status_code == 422
    assert (await client.post(FOUNDATION_URL, json=foundation_payload(**answer))).status_code == 422


async def test_foundation_form_records_the_old_batch(client, auth_headers):
    await seed_programs(client)
    assert (await client.post(FOUNDATION_URL, json=foundation_payload(**REJOIN_30))).status_code == 201
    assert (await only_lead(client, auth_headers))["rejoin_batch"] == 30


async def test_a_rejoin_on_induction_carries_to_foundation(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(**REJOIN_30))
    await client.post(FOUNDATION_URL, json=foundation_payload(is_rejoin=False))

    assert (await only_lead(client, auth_headers))["rejoin_batch"] == 30
    assert (await only_entry(client, auth_headers, "moved_to_foundation"))["rejoin_batch"] == 30


async def test_a_rejoin_on_foundation_shows_on_induction(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload(**REJOIN_30))

    assert (await only_lead(client, auth_headers))["rejoin_batch"] == 30
    assert (await only_entry(client, auth_headers, "moved_to_foundation"))["rejoin_batch"] == 30


async def test_a_second_foundation_submission_updates_both_sides_but_never_clears(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload(**REJOIN_30))
    await client.post(FOUNDATION_URL, json=foundation_payload(is_rejoin=False))

    assert (await only_lead(client, auth_headers))["rejoin_batch"] == 30
    assert (await only_entry(client, auth_headers, "moved_to_foundation"))["rejoin_batch"] == 30


async def test_an_edit_on_either_board_reaches_the_other(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())
    lead = await only_lead(client, auth_headers)
    entry = await only_entry(client, auth_headers, "moved_to_foundation")

    edited = await client.put(f"/api/v1/leads/{lead['id']}", headers=auth_headers, json=REJOIN_30)
    assert edited.status_code == 200, edited.text
    assert edited.json()["rejoin_batch"] == 30
    assert (await only_entry(client, auth_headers, "moved_to_foundation"))["rejoin_batch"] == 30

    cleared = await client.put(
        f"/api/v1/induction-entries/{entry['id']}", headers=auth_headers, json={"is_rejoin": False}
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["rejoin_batch"] is None
    assert (await only_lead(client, auth_headers))["rejoin_batch"] is None


async def test_an_unrelated_edit_leaves_the_rejoin_alone(client, auth_headers):
    await client.post(INDUCTION_URL, json=induction_payload(**REJOIN_30))
    entry = await only_entry(client, auth_headers)
    edited = await client.put(
        f"/api/v1/induction-entries/{entry['id']}", headers=auth_headers, json={"category": "Fresher"}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["rejoin_batch"] == 30


async def test_create_lead_records_the_old_batch(client, auth_headers):
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Walk In", "phone": "9000000001", "course_interest": "Data Science", **REJOIN_30},
    )
    assert created.status_code == 201, created.text
    assert created.json()["rejoin_batch"] == 30
