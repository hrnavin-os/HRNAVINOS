"""Tests for the Section question at the end of the Induction Call Form: the
section picked is the section the entry is filed under and assigned within."""
from app.models.induction_form_config import InductionFormConfig
from app.models.role import Role
from app.models.user import User

CONFIG_URL = "/api/v1/public/induction-form/config"
SUBMIT_URL = "/api/v1/public/induction-form/submit"


def payload(**overrides) -> dict:
    return {"name": "Arun", "phone": "9876543210", "registration_date": "2026-08-04", **overrides}


async def make_section_admin(section: str, email: str) -> User:
    role = await Role.find_one({"scoped_section": section, "is_deleted": False})
    if role is None:
        role = Role(name=f"Test {section.upper()}-Section Admin", scoped_section=section)
        await role.insert()
    user = User(
        email=email, first_name="Admin", last_name=section.upper(),
        password_hash="x", role_id=role.id, is_active=True,
    )
    await user.insert()
    return user


async def entry_for(client, auth_headers, name: str) -> dict:
    items = (await client.get(f"/api/v1/induction-entries?search={name}", headers=auth_headers)).json()["items"]
    assert len(items) == 1, items
    return items[0]


async def test_the_form_asks_for_a_required_section(client):
    fields = (await client.get(CONFIG_URL)).json()["fields"]
    section = next(field for field in fields if field["key"] == "section")
    assert section["required"] is True
    assert section["options"] == ["A Section", "B Section", "C Section"]


async def test_the_form_asks_for_an_optional_group(client):
    """Optional, unlike the section: the class a student will sit in is often
    decided after they are keyed in, and a required field would make whoever
    is typing guess one."""
    fields = (await client.get(CONFIG_URL)).json()["fields"]
    group = next(field for field in fields if field["key"] == "group")
    assert group["required"] is False
    assert group["options"] == ["Group 1", "Group 2", "Group 3"]


async def test_existing_config_gets_the_section_field_appended(client):
    await client.get(CONFIG_URL)
    config = await InductionFormConfig.find_one({})
    config.fields = [field for field in config.fields if field.key != "section"]
    await config.save()

    fields = (await client.get(CONFIG_URL)).json()["fields"]
    assert [field["key"] for field in fields].count("section") == 1
    assert fields[-1]["key"] == "section"


async def test_each_section_option_files_the_entry_under_that_section(client, seeded, auth_headers):
    admins = {code: await make_section_admin(code, f"sec.{code}@hrnavinos.com") for code in ("a", "b", "c")}

    for index, (code, label) in enumerate([("a", "A Section"), ("b", "B Section"), ("c", "C Section")]):
        name = f"Person{code.upper()}"
        response = await client.post(SUBMIT_URL, json=payload(name=name, phone=f"98765432{index}0", section=label))
        assert response.status_code == 201, response.text

        entry = await entry_for(client, auth_headers, name)
        assert entry["section"] == code
        assert entry["assigned_to"] == str(admins[code].id)


async def test_unknown_section_is_refused(client, seeded):
    response = await client.post(SUBMIT_URL, json=payload(section="Z Section"))
    assert response.status_code == 400


# --------------------------------------------------------------------------
# The stat cards
#
# They sit directly above the table and are a summary of it. A card reading 30
# over a table showing 2 is not a summary, and that is what a Section Admin saw
# before these: the per-tab counts were the only figure on the endpoint that
# ignored both the role's scope and the filter row.
# --------------------------------------------------------------------------

STATS_URL = "/api/v1/induction-entries/stats"


async def seed_board(client) -> None:
    """Six entries: four in A Section, two in B, one of each quit."""
    for index, (name, label) in enumerate(
        [
            ("Arun", "A Section"),
            ("Bala", "A Section"),
            ("Chitra", "A Section"),
            ("Divya", "A Section"),
            ("Eswar", "B Section"),
            ("Farida", "B Section"),
        ]
    ):
        response = await client.post(
            SUBMIT_URL,
            json=payload(name=name, phone=f"98765000{index}0", section=label, sales_person="Priya"),
        )
        assert response.status_code == 201, response.text


async def test_the_cards_count_only_the_section_admins_own_students(client, seeded, auth_headers):
    """The reported bug: an A-Section admin's table showed two rows while the
    card above it said thirty. The scope is forced on server-side, so it holds
    whether or not the client sends a section."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)

    everyone = (await client.get(STATS_URL, headers=auth_headers)).json()
    assert everyone["by_status"]["pending_induction"] == 6

    scoped = (await client.get(STATS_URL, headers=auth_headers, params={"section": "a"})).json()
    assert scoped["by_status"]["pending_induction"] == 4
    assert scoped["total"] == 4


async def test_the_cards_follow_the_filter_row(client, seeded, auth_headers):
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)

    # A filter that matches everything leaves the counts alone...
    matched = (
        await client.get(STATS_URL, headers=auth_headers, params={"sales_person": "Priya"})
    ).json()
    assert matched["by_status"]["pending_induction"] == 6

    # ...and one that matches nothing takes them to zero, rather than the cards
    # carrying on as if the table below them were still full.
    unmatched = (
        await client.get(STATS_URL, headers=auth_headers, params={"sales_person": "Nobody"})
    ).json()
    assert unmatched["by_status"]["pending_induction"] == 0
    assert unmatched["total"] == 0


async def test_the_search_box_narrows_the_cards_too(client, seeded, auth_headers):
    """Search is part of what the table shows, so it is part of what the cards
    count - otherwise typing a name leaves one row on screen under a card
    claiming six."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)

    stats = (await client.get(STATS_URL, headers=auth_headers, params={"search": "Arun"})).json()
    assert stats["by_status"]["pending_induction"] == 1


async def test_every_card_counts_the_same_population_as_its_own_tab(client, seeded, auth_headers):
    """The cards double as the tab selector, so the number on a card has to be
    the number of rows you get by clicking it - under whatever filters are on."""
    await make_section_admin("a", "sec.a@hrnavinos.com")
    await make_section_admin("b", "sec.b@hrnavinos.com")
    await seed_board(client)

    entry = await entry_for(client, auth_headers, "Arun")
    await client.put(
        f"/api/v1/induction-entries/{entry['id']}",
        headers=auth_headers,
        json={"call_remark": "Quit - Before Induction Call", "quit_reason": "Changed their mind"},
    )

    params = {"section": "a"}
    cards = (await client.get(STATS_URL, headers=auth_headers, params=params)).json()["by_status"]
    for tab, counted in cards.items():
        listed = (
            await client.get(
                "/api/v1/induction-entries", headers=auth_headers, params={**params, "status": tab}
            )
        ).json()["total"]
        assert listed == counted, f"{tab}: card said {counted}, table has {listed}"
    assert cards["quit"] == 1
    assert cards["pending_induction"] == 3
