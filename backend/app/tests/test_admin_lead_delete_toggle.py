"""The Super Admin's "Admin can delete leads" switch in Settings."""
from datetime import date

from app.core.security import hash_password
from app.models.induction_entry import InductionEntry
from app.models.role import Role
from app.models.user import User

TOGGLE_URL = "/api/v1/settings/lead-delete"


async def _login_as(client, role_name: str, email: str) -> dict:
    role = await Role.find_one({"name": role_name, "is_deleted": False})
    await User(
        email=email,
        first_name="Test",
        last_name=role_name,
        password_hash=hash_password("Passw0rd!23"),
        role_id=role.id,
        is_active=True,
    ).insert()
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd!23"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _make_lead(client, auth_headers, phone: str) -> str:
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Walk In", "phone": phone, "course_interest": "Data Science"},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _make_entry(phone: str) -> str:
    entry = InductionEntry(name="Induction", phone=phone, registration_date=date(2026, 9, 1), batch_number=29)
    await entry.insert()
    return str(entry.id)


async def _permissions(client, headers) -> list[str]:
    return (await client.get("/api/v1/auth/me", headers=headers)).json()["permissions"]


async def test_admin_deletes_leads_on_both_boards_only_while_the_toggle_is_on(client, auth_headers):
    admin = await _login_as(client, "Admin", "admin.head@example.com")

    # Off by default: no delete option, and the endpoints refuse.
    assert (await client.get(TOGGLE_URL, headers=auth_headers)).json() == {"enabled": False}
    assert "leads.delete" not in await _permissions(client, admin)
    lead_id = await _make_lead(client, auth_headers, "9000000001")
    entry_id = await _make_entry("9000000002")
    assert (await client.delete(f"/api/v1/leads/{lead_id}", headers=admin)).status_code == 403
    assert (await client.delete(f"/api/v1/induction-entries/{entry_id}", headers=admin)).status_code == 403

    turned_on = await client.put(TOGGLE_URL, headers=auth_headers, json={"enabled": True})
    assert turned_on.status_code == 200, turned_on.text
    assert turned_on.json() == {"enabled": True}

    # On: the boards' delete option appears (it reads leads.delete off /me)
    # and both deletes go through.
    assert "leads.delete" in await _permissions(client, admin)
    assert (await client.delete(f"/api/v1/leads/{lead_id}", headers=admin)).status_code == 200
    assert (await client.delete(f"/api/v1/induction-entries/{entry_id}", headers=admin)).status_code == 200

    # Off again: withdrawn.
    await client.put(TOGGLE_URL, headers=auth_headers, json={"enabled": False})
    assert "leads.delete" not in await _permissions(client, admin)
    another = await _make_lead(client, auth_headers, "9000000003")
    assert (await client.delete(f"/api/v1/leads/{another}", headers=admin)).status_code == 403


async def test_section_admins_never_get_delete_from_the_toggle(client, auth_headers):
    section_admin = await _login_as(client, "A-Section Admin", "a.section@example.com")
    await client.put(TOGGLE_URL, headers=auth_headers, json={"enabled": True})

    assert "leads.delete" not in await _permissions(client, section_admin)


async def test_super_admin_deletes_with_the_toggle_off(client, auth_headers):
    lead_id = await _make_lead(client, auth_headers, "9000000004")

    assert (await client.delete(f"/api/v1/leads/{lead_id}", headers=auth_headers)).status_code == 200


async def test_only_super_admin_can_flip_the_toggle(client, auth_headers):
    # Admin Head holds settings.update, which is what the general settings form
    # needs - and still must not be able to reach this switch.
    admin_head = await _login_as(client, "Admin Head", "admin.head.role@example.com")

    assert (await client.get(TOGGLE_URL, headers=admin_head)).status_code == 403
    assert (await client.put(TOGGLE_URL, headers=admin_head, json={"enabled": True})).status_code == 403
    assert (await client.get(TOGGLE_URL, headers=auth_headers)).json() == {"enabled": False}
