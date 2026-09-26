"""The Admin team's roles: Admin Head, the Section Admins, the Attendance
Coordinator and the Operation Coordinator - what each is given, the one-time
alignment of a live database to that, and the Section Admins' own-section view
of Batch Confirmation and WhatsApp Links."""
from app.core.security import hash_password
from app.database.backfills import ADMIN_TEAM_MIGRATION, align_admin_team_roles, describe_admin_team_roles
from app.models.enums import LeadStatus
from app.models.lead import Lead
from app.models.permission import Permission
from app.models.role import Role
from app.models.user import User
from app.services.foundation_form_config_service import FoundationFormConfigService

GROUP_LINK = "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt"


async def _codes(role: Role) -> set[str]:
    return {p.code for p in await Permission.find({"_id": {"$in": role.permission_ids}}).to_list()}


async def _role(name: str) -> Role:
    return await Role.find_one({"name": name, "is_deleted": False})


async def _login_as(client, role_name: str, email: str) -> dict:
    role = await _role(role_name)
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


# ---------------------------------------------------------------------------
# What each designation is given
# ---------------------------------------------------------------------------


async def test_each_admin_team_role_holds_exactly_its_menus(seeded):
    assert await _codes(await _role("Admin Head")) == {
        "leads.view", "leads.create", "leads.update",
        "lead_analytics.view",
        "form_collection.view", "form_collection.configure",
        "induction_attendance.view", "induction_attendance.mark", "induction_attendance.configure",
        "programs.view", "programs.create", "programs.update", "programs.delete",
        "sheet_export.view", "sheet_export.update",
    }
    for section in "ABC":
        assert await _codes(await _role(f"{section}-Section Admin")) == {
            "leads.view", "leads.create", "leads.update",
            "induction_attendance.view", "induction_attendance.mark",
            "batch_confirmation.view", "batch_confirmation.allocate",
            "whatsapp_links.view",
        }
    assert await _codes(await _role("Attendance Coordinator")) == {
        "induction_attendance.view", "induction_attendance.mark", "induction_attendance.configure",
    }
    assert await _codes(await _role("Operation Coordinator")) == {"lead_analytics.view"}
    # The old name for Admin Head is not seeded any more.
    assert await _role("Admin") is None


async def test_the_operation_coordinator_reads_statistics_and_not_the_boards(client, auth_headers):
    headers = await _login_as(client, "Operation Coordinator", "ops@example.com")

    # Both halves of Statistics, including the course list its Courses tab
    # fills the zeros from.
    assert (await client.get("/api/v1/leads/analytics", headers=headers)).status_code == 200
    assert (await client.get("/api/v1/leads/course-catalog", headers=headers)).status_code == 200
    # The rows themselves are the Lead Dashboard's.
    assert (await client.get("/api/v1/leads", headers=headers)).status_code == 403


# ---------------------------------------------------------------------------
# Aligning a live database
# ---------------------------------------------------------------------------


async def _put_back_the_old_designations() -> User:
    """A database as it stood before the alignment: an "Admin" role with a
    member, an Admin Head carrying modules nothing links to, Section Admins
    with the menus that are no longer theirs, and neither coordinator."""
    extra = {p.code: p.id for p in await Permission.find({}).to_list()}
    head = await _role("Admin Head")
    admin = Role(name="Admin", permission_ids=list(head.permission_ids))
    await admin.insert()
    head.permission_ids = [extra["admissions.view"], extra["settings.update"], extra["dashboard.view"]]
    await head.save()
    section = await _role("A-Section Admin")
    section.permission_ids = [extra["leads.view"], extra["notifications.view"], extra["form_collection.view"]]
    await section.save()
    for name in ("Attendance Coordinator", "Operation Coordinator"):
        await (await _role(name)).delete()

    member = User(
        email="old.admin@example.com",
        first_name="Old",
        last_name="Admin",
        password_hash=hash_password("Passw0rd!23"),
        role_id=admin.id,
        is_active=True,
    )
    await member.insert()
    return member


async def test_the_alignment_sets_each_role_to_its_designation(seeded):
    member = await _put_back_the_old_designations()

    assert await align_admin_team_roles() is True

    head = await _role("Admin Head")
    assert "admissions.view" not in await _codes(head)
    assert {"lead_analytics.view", "programs.view", "sheet_export.view"} <= await _codes(head)
    assert "notifications.view" not in await _codes(await _role("A-Section Admin"))
    assert "batch_confirmation.view" in await _codes(await _role("A-Section Admin"))
    assert await _role("Attendance Coordinator") is not None
    assert await _role("Operation Coordinator") is not None

    # The Admin's members are Admin Heads now, and the role is retired on the
    # record rather than erased.
    assert (await User.get(member.id)).role_id == head.id
    retired = await Role.find_one({"name": "Admin"})
    assert retired.is_deleted
    assert "Admin Head" in retired.deleted_reason


async def test_the_alignment_runs_once(seeded):
    assert await align_admin_team_roles() is True

    # Afterwards the roles are the Super Admin's to edit again, and a boot
    # doesn't take back what they granted.
    head = await _role("Admin Head")
    dashboard = await Permission.find_one({"code": "dashboard.view"})
    head.permission_ids = [*head.permission_ids, dashboard.id]
    await head.save()

    assert await align_admin_team_roles() is False
    assert "dashboard.view" in await _codes(await _role("Admin Head"))
    migrations = Role.get_motor_collection().database["migrations"]
    assert await migrations.find_one({"_id": ADMIN_TEAM_MIGRATION})


# ---------------------------------------------------------------------------
# Section Admins on Batch Confirmation and WhatsApp Links
# ---------------------------------------------------------------------------


async def _onboarding_lead(name: str, phone: str, section: str, **overrides) -> Lead:
    lead = Lead(name=name, phone=phone, section=section, status=LeadStatus.BATCH_CONFIRMATION, **overrides)
    await lead.insert()
    return lead


async def test_a_section_admin_onboards_their_own_section_only(client, auth_headers):
    for code in ("a", "b"):
        await FoundationFormConfigService().set_whatsapp_link(code, GROUP_LINK, actor_id=None)
    own = await _onboarding_lead("Arun", "9876500001", "a")
    other = await _onboarding_lead("Bala", "9876500002", "b")
    headers = await _login_as(client, "A-Section Admin", "a.section@example.com")

    queue = (await client.get("/api/v1/batch-confirmation/whatsapp/queue", headers=headers)).json()
    assert [row["name"] for row in queue] == ["Arun"]
    counts = (await client.get("/api/v1/batch-confirmation/whatsapp/counts", headers=headers)).json()
    assert counts["all"] == 1

    sent = await client.post(f"/api/v1/batch-confirmation/whatsapp/{own.id}/invite", headers=headers)
    assert sent.status_code == 200, sent.text
    # Another section's candidate is not there to act on.
    refused = await client.post(f"/api/v1/batch-confirmation/whatsapp/{other.id}/invite", headers=headers)
    assert refused.status_code == 403
    assert (
        await client.get(f"/api/v1/batch-confirmation/whatsapp/{other.id}/history", headers=headers)
    ).status_code == 403

    # A bulk selection can't reach across either.
    bulk = await client.post(
        "/api/v1/batch-confirmation/whatsapp/invite/bulk",
        headers=headers,
        json={"lead_ids": [str(other.id)]},
    )
    assert bulk.json()["assigned"] == 0
    assert (await Lead.get(other.id)).whatsapp_invite_count == 0

    # The HR Coordinator's view is unchanged: every section.
    everyone = (await client.get("/api/v1/batch-confirmation/whatsapp/queue", headers=auth_headers)).json()
    assert {row["name"] for row in everyone} == {"Arun", "Bala"}


async def test_a_section_admins_lost_tab_and_stage_moves_are_their_own(client, auth_headers):
    lost_own = Lead(name="Arun", phone="9876500001", section="a", status=LeadStatus.LOST, lost_reason="Quit")
    lost_other = Lead(name="Bala", phone="9876500002", section="b", status=LeadStatus.LOST, lost_reason="Quit")
    await lost_own.insert()
    await lost_other.insert()
    headers = await _login_as(client, "A-Section Admin", "a.section@example.com")

    lost = (await client.get("/api/v1/batch-confirmation/students?tab=lost", headers=headers)).json()
    assert [row["name"] for row in lost] == ["Arun"]

    moved = await client.post(
        f"/api/v1/batch-confirmation/students/{lost_other.id}/stage",
        headers=headers,
        json={"status": "batch_confirmation"},
    )
    assert moved.status_code == 403
    assert (await Lead.get(lost_other.id)).status == LeadStatus.LOST


async def test_a_section_admin_sees_and_sets_only_their_own_group_link(client, auth_headers):
    headers = await _login_as(client, "A-Section Admin", "a.section@example.com")

    links = (await client.get("/api/v1/batch-confirmation/whatsapp-links", headers=headers)).json()
    assert [link["code"] for link in links] == ["a"]

    own = await client.put(
        "/api/v1/batch-confirmation/whatsapp-links/a", headers=headers, json={"whatsapp_group_url": GROUP_LINK}
    )
    assert own.status_code == 200, own.text
    other = await client.put(
        "/api/v1/batch-confirmation/whatsapp-links/b", headers=headers, json={"whatsapp_group_url": GROUP_LINK}
    )
    assert other.status_code == 403


async def test_batch_allocation_is_not_open_to_a_section_admin(client, auth_headers):
    headers = await _login_as(client, "A-Section Admin", "a.section@example.com")

    for path in ("/summary", "/pending-leads", "/allocations", "/batches", "/options"):
        response = await client.get(f"/api/v1/batch-confirmation{path}", headers=headers)
        assert response.status_code == 403, path
    # The HR Coordinator still has all of it.
    assert (await client.get("/api/v1/batch-confirmation/summary", headers=auth_headers)).status_code == 200


# ---------------------------------------------------------------------------
# The role editor
# ---------------------------------------------------------------------------


async def test_the_role_editor_offers_the_four_designations(client, auth_headers):
    response = await client.get("/api/v1/roles/designations", headers=auth_headers)
    assert response.status_code == 200, response.text
    designations = {item["name"]: item for item in response.json()}

    assert list(designations) == ["Admin Head", "Section Admin", "Attendance Coordinator", "Operation Coordinator"]
    assert designations["Operation Coordinator"]["permission_codes"] == ["lead_analytics.view"]
    assert designations["Section Admin"]["section_scoped"] is True
    assert designations["Admin Head"]["section_scoped"] is False
    # Every code a designation ticks is one the editor actually offers, or the
    # picker would tick boxes nobody can see.
    offered = {
        p["code"]
        for p in (await client.get("/api/v1/permissions", headers=auth_headers, params={"page_size": 100})).json()[
            "items"
        ]
    }
    for designation in designations.values():
        assert set(designation["permission_codes"]) <= offered, designation["name"]


async def test_admin_team_roles_are_described_by_their_designation(seeded):
    assert await describe_admin_team_roles() == 6
    assert (await _role("Operation Coordinator")).description == "Statistics: lead analysis and finance analysis."
    assert "own section" in (await _role("B-Section Admin")).description

    # A description somebody wrote stays theirs.
    head = await _role("Admin Head")
    head.description = "Runs the admin desk."
    await head.save()
    assert await describe_admin_team_roles() == 0
    assert (await _role("Admin Head")).description == "Runs the admin desk."
