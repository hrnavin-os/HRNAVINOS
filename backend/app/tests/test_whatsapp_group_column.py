"""Tests for the WhatsApp column on the Induction and Foundation boards: a
tick per row for "added to the group", and the added / not added count in
the column's header."""
from app.tests.test_induction_section_field import STATS_URL, entry_for, make_section_admin, seed_board

LEADS_URL = "/api/v1/leads"
COUNTS_URL = "/api/v1/leads/whatsapp-counts"


# --------------------------------------------------------------------------
# Induction
# --------------------------------------------------------------------------


async def tick_induction(client, auth_headers, name: str, added: bool = True) -> dict:
    entry = await entry_for(client, auth_headers, name)
    response = await client.put(
        f"/api/v1/induction-entries/{entry['id']}/details",
        headers=auth_headers,
        json={"other_details": {"whatsapp_group_added": added}},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_the_induction_tick_leaves_the_rest_of_the_page_alone(client, seeded, auth_headers):
    """The column writes one key through the Update form's endpoint, so the
    answers the form recorded on the same page have to survive it."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)
    entry = await entry_for(client, auth_headers, "Arun")
    await client.put(
        f"/api/v1/induction-entries/{entry['id']}/details",
        headers=auth_headers,
        json={"other_details": {"terms_form_signed": True, "confidence": "75%"}},
    )

    details = (await tick_induction(client, auth_headers, "Arun"))["other_details"]

    assert details["whatsapp_group_added"] is True
    assert details["terms_form_signed"] is True
    assert details["confidence"] == "75%"


async def test_the_induction_count_is_per_tab_and_follows_the_filters(client, seeded, auth_headers):
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)
    for name in ("Arun", "Bala", "Eswar"):
        await tick_induction(client, auth_headers, name)
    # Unticking counts as not added, same as never ticked.
    await tick_induction(client, auth_headers, "Chitra", added=False)
    # A ticked student who quits is counted on the Quit tab, not the pending one.
    arun = await entry_for(client, auth_headers, "Arun")
    await client.put(
        f"/api/v1/induction-entries/{arun['id']}",
        headers=auth_headers,
        json={"call_remark": "Quit - Before Induction Call", "quit_reason": "Changed their mind"},
    )

    everyone = (await client.get(STATS_URL, headers=auth_headers)).json()
    assert everyone["whatsapp_added_by_status"]["pending_induction"] == 2
    assert everyone["whatsapp_added_by_status"]["quit"] == 1
    assert everyone["by_status"]["pending_induction"] == 5

    section_a = (await client.get(STATS_URL, headers=auth_headers, params={"section": "a"})).json()
    assert section_a["whatsapp_added_by_status"]["pending_induction"] == 1
    assert section_a["by_status"]["pending_induction"] == 3

    searched = (await client.get(STATS_URL, headers=auth_headers, params={"search": "Bala"})).json()
    assert searched["whatsapp_added_by_status"]["pending_induction"] == 1


# --------------------------------------------------------------------------
# Foundation
# --------------------------------------------------------------------------


async def create_lead(client, auth_headers, name: str, phone: str) -> str:
    response = await client.post(
        LEADS_URL, headers=auth_headers, json={"name": name, "phone": phone, "course_interest": "Data Science"}
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def tick_lead(client, auth_headers, lead_id: str, added: bool) -> dict:
    response = await client.put(f"{LEADS_URL}/{lead_id}", headers=auth_headers, json={"whatsapp_group_added": added})
    assert response.status_code == 200, response.text
    return response.json()


async def test_the_foundation_tick_records_the_join(client, auth_headers):
    """It writes the same join the HR WhatsApp board records, so the two boards
    agree, and ticking someone already in keeps the time they joined."""
    lead_id = await create_lead(client, auth_headers, "Ravi Kumar", "9876543210")

    joined_at = (await tick_lead(client, auth_headers, lead_id, True))["group_assigned_at"]
    assert joined_at is not None
    assert (await tick_lead(client, auth_headers, lead_id, True))["group_assigned_at"] == joined_at

    assert (await tick_lead(client, auth_headers, lead_id, False))["group_assigned_at"] is None


async def test_the_foundation_count_describes_the_rows_in_the_table(client, auth_headers):
    first = await create_lead(client, auth_headers, "Lead One", "1111111111")
    second = await create_lead(client, auth_headers, "Lead Two", "2222222222")
    await create_lead(client, auth_headers, "Lead Three", "3333333333")
    await tick_lead(client, auth_headers, first, True)
    await tick_lead(client, auth_headers, second, True)
    await client.put(f"{LEADS_URL}/{second}", headers=auth_headers, json={"status": "pre_screening"})

    everyone = (await client.get(COUNTS_URL, headers=auth_headers)).json()
    assert everyone == {"added": 2, "not_added": 1}

    # The stage the table is filtered to narrows it too.
    new_leads = (await client.get(COUNTS_URL, headers=auth_headers, params={"status": "new_lead"})).json()
    assert new_leads == {"added": 1, "not_added": 1}

    searched = (await client.get(COUNTS_URL, headers=auth_headers, params={"search": "Three"})).json()
    assert searched == {"added": 0, "not_added": 1}
