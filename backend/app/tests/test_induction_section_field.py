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


async def test_config_ends_with_a_required_section_dropdown(client):
    fields = (await client.get(CONFIG_URL)).json()["fields"]
    last = fields[-1]
    assert last["key"] == "section"
    assert last["required"] is True
    assert last["options"] == ["A Section", "B Section", "C Section"]


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
