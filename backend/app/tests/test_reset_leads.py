"""Tests for the Super Admin "reset leads" action in Settings.

The destructive endpoint in the app, so what it does NOT do matters as much as
what it does.
"""
INDUCTION_URL = "/api/v1/public/induction-form/submit"
FOUNDATION_URL = "/api/v1/public/foundation-form/submit"
RESET_URL = "/api/v1/settings/reset-leads"
CONFIRM = {"confirm": "DELETE ALL LEADS"}


def foundation_payload(**overrides) -> dict:
    return {
        "name": "Arun Kumar",
        "mobile_number": "9876543210",
        "email": "arun@example.com",
        "program_interest": "only_recruitment",
        "payment_timeline": "immediate",
        "queries": "None",
        **overrides,
    }


def induction_payload(**overrides) -> dict:
    return {
        "name": "Arun",
        "phone": "9876543210",
        "registration_date": "2026-08-04",
        **overrides,
    }


async def seed_programs(client) -> None:
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200


async def test_reset_clears_every_lead(client, auth_headers):
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload(name="Two", mobile_number="9123456789"))

    response = await client.post(RESET_URL, json=CONFIRM, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["leads_deleted"] == 2

    assert (await client.get("/api/v1/leads", headers=auth_headers)).json()["total"] == 0


async def test_reset_returns_moved_entries_to_the_induction_board(client, auth_headers):
    """An induction entry's status is derived from foundation_lead_id, so an
    entry still pointing at a deleted lead would sit in "Moved to Foundation"
    forever with nothing on the other end."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    moved = await client.get("/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers)
    assert moved.json()["total"] == 1

    body = (await client.post(RESET_URL, json=CONFIRM, headers=auth_headers)).json()
    assert body["induction_entries_unlinked"] == 1

    # The entry survives the reset and is workable again, rather than being
    # deleted along with the lead it had been linked to.
    pending = await client.get("/api/v1/induction-entries?status=pending_induction", headers=auth_headers)
    assert pending.json()["total"] == 1
    assert pending.json()["items"][0]["name"] == "Arun"

    moved_after = await client.get("/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers)
    assert moved_after.json()["total"] == 0


async def test_the_same_number_can_submit_again_after_a_reset(client, auth_headers):
    """Otherwise it is not a reset: the duplicate check would merge the new
    submission into the soft-deleted lead and nothing would appear."""
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload())
    await client.post(RESET_URL, json=CONFIRM, headers=auth_headers)

    assert (await client.post(FOUNDATION_URL, json=foundation_payload())).status_code == 201

    leads = (await client.get("/api/v1/leads", headers=auth_headers)).json()
    assert leads["total"] == 1


async def test_reset_refuses_without_the_exact_phrase(client, auth_headers):
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload())

    for bad in ({"confirm": ""}, {"confirm": "delete all leads"}, {"confirm": "DELETE"}):
        response = await client.post(RESET_URL, json=bad, headers=auth_headers)
        assert response.status_code == 400, bad

    # Nothing was touched by any of the refused attempts.
    assert (await client.get("/api/v1/leads", headers=auth_headers)).json()["total"] == 1


async def test_reset_requires_super_admin(client, seeded, auth_headers):
    """Gated on the role rather than a permission code, so it cannot be handed
    out by ticking a box on some other role."""
    roles = (await client.get("/api/v1/roles", headers=auth_headers)).json()
    admin_role = next(r for r in roles["items"] if r["name"] != "Super Admin")

    created = await client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "email": "not.super@hrnavinos.com",
            "password": "AnotherPass123!",
            "first_name": "Not",
            "last_name": "Super",
            "role_id": admin_role["id"],
        },
    )
    assert created.status_code == 201, created.text

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "not.super@hrnavinos.com", "password": "AnotherPass123!"},
    )
    other = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (await client.post(RESET_URL, json=CONFIRM, headers=other)).status_code == 403
