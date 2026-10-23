"""Deleting leads from the Induction and Foundation boards, with a reason, and
the Deleted History that lists them afterwards."""
from datetime import date

from app.core.security import hash_password
from app.models.enums import InductionStatus, LeadStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.permission import Permission
from app.models.role import Role
from app.models.user import User

REASON = {"reason": "Duplicate of an existing lead"}


async def _login_as(client, role_name: str, email: str, first_name: str = "Test") -> dict:
    role = await Role.find_one({"name": role_name, "is_deleted": False})
    await User(
        email=email,
        first_name=first_name,
        last_name=role_name,
        password_hash=hash_password("Passw0rd!23"),
        role_id=role.id,
        is_active=True,
    ).insert()
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "Passw0rd!23"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _permissions(client, headers) -> list[str]:
    return (await client.get("/api/v1/auth/me", headers=headers)).json()["permissions"]


async def _lead(name: str = "Walk In", phone: str = "9000000001", **fields) -> Lead:
    lead = Lead(name=name, phone=phone, section="a", course_interest="Data Science", **fields)
    await lead.insert()
    return lead


async def _entry(name: str = "Induction", phone: str = "9000000002", **fields) -> InductionEntry:
    entry = InductionEntry(name=name, phone=phone, registration_date=date(2026, 9, 1), batch_number=29, **fields)
    await entry.insert()
    return entry


def _delete(client, url: str, headers: dict, body: dict | None = REASON):
    # httpx's .delete() takes no body, so DELETE-with-a-body goes via request().
    return client.request("DELETE", url, headers=headers, json=body)


async def test_admin_deletes_on_both_boards_and_reads_it_back_in_the_history(client, auth_headers):
    admin = await _login_as(client, "Admin Head", "admin.head@example.com", first_name="Monissha")
    assert "leads.delete" in await _permissions(client, admin)
    lead = await _lead()
    entry = await _entry()

    assert (await _delete(client, f"/api/v1/leads/{lead.id}", admin)).status_code == 200
    removed = await _delete(
        client, f"/api/v1/induction-entries/{entry.id}", admin, {"reason": "  Test entry, not a real candidate  "}
    )
    assert removed.status_code == 200, removed.text

    foundation = (await client.get("/api/v1/leads/deleted", headers=admin)).json()
    assert foundation["total"] == 1
    row = foundation["items"][0]
    assert row["name"] == "Walk In"
    assert row["status"] == LeadStatus.NEW_LEAD.value
    assert row["deleted_reason"] == REASON["reason"]
    assert row["deleted_by_name"] == "Monissha Admin Head"
    assert row["deleted_at"]

    induction = (await client.get("/api/v1/induction-entries/deleted", headers=admin)).json()
    assert [item["name"] for item in induction["items"]] == ["Induction"]
    # Stored trimmed, the way it was meant.
    assert induction["items"][0]["deleted_reason"] == "Test entry, not a real candidate"
    assert induction["items"][0]["status"] == InductionStatus.PENDING_INDUCTION.value


async def test_a_delete_without_a_reason_is_refused(client, auth_headers):
    lead = await _lead()
    entry = await _entry()

    for url in (f"/api/v1/leads/{lead.id}", f"/api/v1/induction-entries/{entry.id}"):
        assert (await _delete(client, url, auth_headers, None)).status_code == 422
        assert (await _delete(client, url, auth_headers, {"reason": ""})).status_code == 422
        # Long enough for the schema, nothing once trimmed.
        assert (await _delete(client, url, auth_headers, {"reason": "     "})).status_code == 400

    assert (await Lead.get(lead.id)).is_deleted is False
    assert (await InductionEntry.get(entry.id)).is_deleted is False


async def test_the_history_is_newest_first_and_searchable(client, auth_headers):
    first = await _lead(name="Anand", phone="9000000011")
    second = await _lead(name="Bhavya", phone="9000000012")
    await _delete(client, f"/api/v1/leads/{first.id}", auth_headers)
    await _delete(client, f"/api/v1/leads/{second.id}", auth_headers)

    listed = (await client.get("/api/v1/leads/deleted", headers=auth_headers)).json()
    assert [row["name"] for row in listed["items"]] == ["Bhavya", "Anand"]

    found = (await client.get("/api/v1/leads/deleted", headers=auth_headers, params={"search": "9000000011"})).json()
    assert [row["name"] for row in found["items"]] == ["Anand"]


async def test_a_board_reset_does_not_flood_the_history(client, auth_headers):
    chosen = await _lead(name="Chosen", phone="9000000021")
    await _lead(name="Swept", phone="9000000022")
    await _delete(client, f"/api/v1/leads/{chosen.id}", auth_headers)

    reset = await client.post(
        "/api/v1/settings/reset-leads",
        headers=auth_headers,
        json={"confirm": "DELETE FOUNDATION LEADS", "scope": "foundation"},
    )
    assert reset.status_code == 200, reset.text

    listed = (await client.get("/api/v1/leads/deleted", headers=auth_headers)).json()
    assert [row["name"] for row in listed["items"]] == ["Chosen"]


async def test_deleting_a_foundation_lead_returns_its_induction_entry(client, auth_headers):
    lead = await _lead()
    entry = await _entry(phone=lead.phone, foundation_lead_id=lead.id)

    assert (await _delete(client, f"/api/v1/leads/{lead.id}", auth_headers)).status_code == 200

    entry = await InductionEntry.get(entry.id)
    assert entry.is_deleted is False
    assert entry.foundation_lead_id is None
    assert entry.status == InductionStatus.PENDING_INDUCTION


async def test_a_moved_entry_can_be_deleted_and_its_lead_stays(client, auth_headers):
    lead = await _lead()
    entry = await _entry(phone=lead.phone, foundation_lead_id=lead.id)

    assert (await _delete(client, f"/api/v1/induction-entries/{entry.id}", auth_headers)).status_code == 200

    assert (await client.get(f"/api/v1/leads/{lead.id}", headers=auth_headers)).status_code == 200
    history = (await client.get("/api/v1/induction-entries/deleted", headers=auth_headers)).json()
    assert history["items"][0]["status"] == InductionStatus.MOVED_TO_FOUNDATION.value


async def test_roles_without_delete_can_neither_delete_nor_read_the_history(client, auth_headers):
    lead = await _lead()
    entry = await _entry()
    # Section Admins are scoped to one section; Finance edits leads on every
    # section but was never given delete.
    for role_name, email in (("A-Section Admin", "a.section@example.com"), ("Finance", "finance@example.com")):
        headers = await _login_as(client, role_name, email)
        assert "leads.delete" not in await _permissions(client, headers)
        assert (await _delete(client, f"/api/v1/leads/{lead.id}", headers)).status_code == 403
        assert (await _delete(client, f"/api/v1/induction-entries/{entry.id}", headers)).status_code == 403
        assert (await client.get("/api/v1/leads/deleted", headers=headers)).status_code == 403
        assert (await client.get("/api/v1/induction-entries/deleted", headers=headers)).status_code == 403


async def test_a_role_still_called_admin_gets_lead_delete_once(seeded):
    from app.database.backfills import grant_lead_delete_to_admin

    view = await Permission.find_one({"code": "leads.view"})
    lead_delete = await Permission.find_one({"code": "leads.delete"})
    admin = Role(name="Admin", permission_ids=[view.id])
    await admin.insert()

    # Admin Head already has it from the seed; only the old-named role gains it.
    assert await grant_lead_delete_to_admin() == 1
    assert lead_delete.id in (await Role.get(admin.id)).permission_ids

    # Once: taken away in the role editor afterwards, it stays away.
    admin = await Role.get(admin.id)
    admin.permission_ids = [view.id]
    await admin.save()
    assert await grant_lead_delete_to_admin() == 0
    assert lead_delete.id not in (await Role.get(admin.id)).permission_ids
