"""Deleting a token or payment recorded on a lead by mistake.

Admin only, by role: what was paid goes back onto the balance, the payments
after it move up a number, and the entry itself is kept in the audit log with
the reason it went.
"""
import pytest

from app.models.audit_log import AuditLog
from app.tests.test_part_payment import amounts, pay, planned_lead
from app.tests.test_reset_leads import login_as


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def delete_url(lead_id: str, index: int) -> str:
    return f"/api/v1/leads/{lead_id}/payments/{index}"


async def delete_payment(client, headers, lead_id: str, index: int, reason: str = "Added by mistake"):
    return await client.request("DELETE", delete_url(lead_id, index), headers=headers, json={"reason": reason})


async def test_a_deleted_payment_goes_back_onto_the_balance(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")
    await pay(client, auth_headers, lead_id, received_amount="3300")
    await pay(client, auth_headers, lead_id, received_amount="2000")

    response = await delete_payment(client, auth_headers, lead_id, 1)

    assert response.status_code == 200, response.text
    body = response.json()
    assert amounts(body) == [("payment", 5000), ("payment", 2000), ("balance", 8000)]
    assert [entry["label"] for entry in body["installments"]] == ["Payment 1", "Payment 2", "Balance Due"]
    # The balance keeps the date it was promised for.
    assert body["installments"][-1]["scheduled_at"] == "2026-09-27"


async def test_a_payment_that_settled_the_fee_brings_the_balance_back(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="15000")

    response = await delete_payment(client, auth_headers, lead_id, 0)

    assert response.status_code == 200, response.text
    assert amounts(response.json()) == [("balance", 15000)]


async def test_the_token_can_be_deleted(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")
    await pay(client, auth_headers, lead_id, proof=False, kind="token", received_amount="1500")

    response = await delete_payment(client, auth_headers, lead_id, 0)

    assert response.status_code == 200, response.text
    assert amounts(response.json()) == [("payment", 5000), ("balance", 10000)]


async def test_the_deleted_entry_is_kept_in_the_audit_log(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="3300", balance_due_at="2026-09-27", qr_code="Chitra-Axis")

    await delete_payment(client, auth_headers, lead_id, 0, reason="Duplicate of Payment 1")

    log = await AuditLog.find_one({"entity_id": lead_id, "action": "DELETE_PAYMENT"})
    assert log is not None
    assert float(log.changes["received_amount"]) == 3300
    assert log.changes["qr_code"] == "Chitra-Axis"
    assert log.changes["reason"] == "Duplicate of Payment 1"
    assert len(log.changes["proof_urls"]) == 1


async def test_a_reason_is_required(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="15000")

    response = await client.request("DELETE", delete_url(lead_id, 0), headers=auth_headers, json={"reason": ""})

    assert response.status_code == 422


async def test_the_balance_cannot_be_deleted(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")

    response = await delete_payment(client, auth_headers, lead_id, 1)

    assert response.status_code == 400


async def test_the_last_payment_stays_while_the_lead_is_in_a_paid_stage(client, auth_headers, uploads):
    """Partially Paid and the stages after it are entered on a payment, so the
    only one can't be taken out from under a lead still in one."""
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")
    moved = await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "partially_paid"})
    assert moved.status_code == 200, moved.text

    response = await delete_payment(client, auth_headers, lead_id, 0)

    assert response.status_code == 400
    assert "earlier stage" in response.json()["message"]


async def test_only_admins_can_delete_a_payment(client, seeded, auth_headers, uploads):
    """Gated on the role, so a Section Admin - who records the payments - can't
    take one off, even with every lead permission ticked."""
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="15000")

    for role_name, email in (("Sales Head", "sales.head@hrnavinos.com"), ("A-Section Admin", "sec.a@hrnavinos.com")):
        other = await login_as(client, auth_headers, role_name, email)
        assert (await delete_payment(client, other, lead_id, 0)).status_code == 403, role_name
        assert (await client.get("/api/v1/auth/me", headers=other)).json()["can_delete_payments"] is False

    admin_head = await login_as(client, auth_headers, "Admin Head", "admin.head@hrnavinos.com")
    assert (await client.get("/api/v1/auth/me", headers=admin_head)).json()["can_delete_payments"] is True
    assert (await delete_payment(client, admin_head, lead_id, 0)).status_code == 200
