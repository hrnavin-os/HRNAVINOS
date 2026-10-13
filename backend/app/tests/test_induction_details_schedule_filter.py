"""Tests for the Details and Call Schedule filters on the Induction board.

Details is the Remarks page's "Will attend" / "Will not attend" answer, or
for "Others" the text typed under it; Call Schedule is the induction call
date set from the board's schedule column.
"""
from app.tests.test_induction_section_field import STATS_URL, entry_for, make_section_admin, seed_board

LIST_URL = "/api/v1/induction-entries"


async def update_details(client, auth_headers, name, payload) -> None:
    entry = await entry_for(client, auth_headers, name)
    response = await client.put(f"{LIST_URL}/{entry['id']}/details", headers=auth_headers, json=payload)
    assert response.status_code == 200, response.text


async def seed(client, auth_headers) -> None:
    """Six entries: two will attend, one won't, one Others answer, two with
    nothing; four calls booked across
    three days, two not booked."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)
    for name, details in (
        ("Arun", "Will attend"),
        ("Bala", "Will attend"),
        ("Chitra", "Will not attend"),
        ("Divya", "Will attend Sunday class"),
    ):
        await update_details(client, auth_headers, name, {"remarks": {"details": details}})
    for name, day in (
        ("Arun", "2026-10-12"),
        ("Bala", "2026-10-13"),
        ("Chitra", "2026-10-13"),
        ("Eswar", "2026-10-15"),
    ):
        await update_details(
            client, auth_headers, name, {"other_details": {"induction_call_date": day, "scheduled_time": "10:30"}}
        )


async def names(client, auth_headers, **params) -> set[str]:
    response = await client.get(LIST_URL, headers=auth_headers, params=params)
    assert response.status_code == 200, response.text
    return {item["name"] for item in response.json()["items"]}


async def test_one_answer_narrows_the_table(client, seeded, auth_headers):
    await seed(client, auth_headers)

    assert await names(client, auth_headers, details="Will attend") == {"Arun", "Bala"}
    assert await names(client, auth_headers, details="Will not attend") == {"Chitra"}


async def test_no_answer_finds_the_entries_nobody_has_answered(client, seeded, auth_headers):
    await seed(client, auth_headers)

    assert await names(client, auth_headers, details="__none__") == {"Eswar", "Farida"}


async def test_others_finds_every_typed_answer(client, seeded, auth_headers):
    """An Others answer is stored as its text, so the filter matches anything
    set that isn't one of the two named answers - free text saved before
    Details was a choice included."""
    await seed(client, auth_headers)
    await update_details(client, auth_headers, "Farida", {"remarks": {"details": "Joining next batch"}})

    assert await names(client, auth_headers, details="__other__") == {"Divya", "Farida"}


async def test_a_schedule_window_narrows_to_calls_inside_it(client, seeded, auth_headers):
    await seed(client, auth_headers)

    assert await names(
        client, auth_headers, schedule_from="2026-10-13", schedule_to="2026-10-13"
    ) == {"Bala", "Chitra"}
    assert await names(
        client, auth_headers, schedule_from="2026-10-12", schedule_to="2026-10-14"
    ) == {"Arun", "Bala", "Chitra"}


async def test_either_end_of_the_schedule_window_may_be_left_open(client, seeded, auth_headers):
    await seed(client, auth_headers)

    assert await names(client, auth_headers, schedule_from="2026-10-13") == {"Bala", "Chitra", "Eswar"}
    assert await names(client, auth_headers, schedule_to="2026-10-12") == {"Arun"}


async def test_not_scheduled_finds_the_calls_nobody_has_booked(client, seeded, auth_headers):
    await seed(client, auth_headers)

    assert await names(client, auth_headers, scheduled="false") == {"Divya", "Farida"}


async def test_the_two_filters_intersect_and_the_cards_follow(client, seeded, auth_headers):
    await seed(client, auth_headers)
    params = {"details": "Will attend", "schedule_from": "2026-10-13", "schedule_to": "2026-10-13"}

    assert await names(client, auth_headers, **params) == {"Bala"}
    stats = (await client.get(STATS_URL, headers=auth_headers, params=params)).json()
    assert stats["by_status"] == {"pending_induction": 1, "moved_to_foundation": 0, "quit": 0}


async def test_the_cards_take_the_registration_date_window_too(client, seeded, auth_headers):
    """The cards run the filters through an aggregation, which refused the
    plain dates the registration window used to send."""
    await seed(client, auth_headers)

    response = await client.get(STATS_URL, headers=auth_headers, params={"date_from": "2000-01-01"})

    assert response.status_code == 200, response.text
    assert response.json()["by_status"]["pending_induction"] == 6
