"""Tests for the Call Remarks filter on the Induction board: one exact remark,
or the entries with none set yet."""
from app.tests.test_induction_foundation_link import set_remark
from app.tests.test_induction_section_field import STATS_URL, entry_for, make_section_admin, seed_board

LIST_URL = "/api/v1/induction-entries"
OPTIONS_URL = "/api/v1/induction-entries/filter-options"


async def seed_remarks(client, auth_headers) -> None:
    """Six entries: two completed, one scheduled, one quit, two with no remark."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)
    for name, remark in (
        ("Arun", "Induction Call Completed - Gmeet"),
        ("Bala", "Induction Call Completed - Gmeet"),
        ("Chitra", "Induction Call Scheduled - Today"),
        ("Divya", "Quit - Before Induction Call"),
    ):
        entry = await entry_for(client, auth_headers, name)
        response = await set_remark(client, auth_headers, entry["id"], remark)
        assert response.status_code == 200, response.text


async def names(client, auth_headers, **params) -> set[str]:
    response = await client.get(LIST_URL, headers=auth_headers, params=params)
    assert response.status_code == 200, response.text
    return {item["name"] for item in response.json()["items"]}


async def test_one_remark_narrows_the_table(client, seeded, auth_headers):
    await seed_remarks(client, auth_headers)

    assert await names(client, auth_headers, call_remark="Induction Call Completed - Gmeet") == {"Arun", "Bala"}


async def test_no_remark_finds_the_entries_nobody_has_set_one_on(client, seeded, auth_headers):
    await seed_remarks(client, auth_headers)

    assert await names(client, auth_headers, call_remark="__none__") == {"Eswar", "Farida"}


async def test_the_filter_holds_alongside_the_tabs_own_remark_rule(client, seeded, auth_headers):
    """Each tab is a condition on call_remark too - quit or not quit. Merged
    into one key, whichever came last would win: the Quit tab would list every
    entry with the filtered remark, or the filter would quietly do nothing."""
    await seed_remarks(client, auth_headers)

    assert await names(client, auth_headers, status="quit", call_remark="Quit - Before Induction Call") == {"Divya"}
    assert await names(client, auth_headers, status="quit", call_remark="Induction Call Completed - Gmeet") == set()
    assert await names(client, auth_headers, call_remark="Quit - Before Induction Call") == set()


async def test_the_cards_count_the_filtered_rows(client, seeded, auth_headers):
    await seed_remarks(client, auth_headers)

    stats = (
        await client.get(STATS_URL, headers=auth_headers, params={"call_remark": "Induction Call Completed - Gmeet"})
    ).json()
    assert stats["by_status"] == {"pending_induction": 2, "moved_to_foundation": 0, "quit": 0}


async def test_the_options_are_the_open_tabs_remarks(client, seeded, auth_headers):
    await seed_remarks(client, auth_headers)

    pending = (await client.get(OPTIONS_URL, headers=auth_headers)).json()
    quit_tab = (await client.get(OPTIONS_URL, headers=auth_headers, params={"status": "quit"})).json()

    assert pending["call_remark"] == ["Induction Call Completed - Gmeet", "Induction Call Scheduled - Today"]
    assert quit_tab["call_remark"] == ["Quit - Before Induction Call"]
