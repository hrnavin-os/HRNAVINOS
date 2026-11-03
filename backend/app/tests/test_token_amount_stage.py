"""The Token Amount stage, between Follow up call and Financial Approval.

Recording the token puts a lead there; moving it there by hand needs the token
on record. It replaced Partially Paid, whose leads are moved out once, on
startup.
"""
import uuid

import pytest

from app.database.backfills import move_partially_paid_to_token_amount
from app.models.audit_log import AuditLog
from app.models.lead import Lead
from app.services.lead_service import LeadService
from app.tests.test_payment_deletion import delete_payment
from app.tests.test_part_payment import pay

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def planned_lead(client, auth_headers, phone: str) -> str:
    """A single-shot ₹15,000 lead with nothing paid yet, at New Lead."""
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)  # seeds programs
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Benazir Fathima", "phone": phone, "program_interest": "recruitment_internship", "payment_plan": "single_shot"},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def token(client, auth_headers, lead_id: str, amount: str = "1000"):
    paid = await pay(client, auth_headers, lead_id, proof=False, kind="token", received_amount=amount, balance_due_at="2026-11-21")
    assert paid.status_code == 200, paid.text
    return paid.json()


async def payment(client, auth_headers, lead_id: str, amount: str = "5000"):
    paid = await pay(client, auth_headers, lead_id, received_amount=amount, balance_due_at="2026-11-21")
    assert paid.status_code == 200, paid.text
    return paid.json()


async def move(client, auth_headers, lead_id: str, status: str, **extra):
    return await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": status, **extra})


async def set_status(lead_id: str, status: str) -> None:
    """Writes a stage straight onto the document - how a lead still in the
    retired Partially Paid stage looks to the migration."""
    await Lead.get_motor_collection().update_one({"_id": uuid.UUID(lead_id)}, {"$set": {"status": status}})


async def test_recording_the_token_moves_the_lead_to_token_amount(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")

    body = await token(client, auth_headers, lead_id)

    assert body["status"] == "token_amount"
    stats = (await client.get("/api/v1/leads/stats", headers=auth_headers)).json()
    assert stats["by_status"]["token_amount"] == 1
    # On the timeline as a move of its own, beside the payment.
    entry = await AuditLog.find_one({"entity_id": lead_id, "changes.status": "token_amount"})
    assert entry.changes["previous_status"] == "new_lead"


async def test_a_payment_that_is_not_a_token_leaves_the_stage_alone(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")

    body = await payment(client, auth_headers, lead_id)

    assert body["status"] == "new_lead"


async def test_a_token_recorded_late_leaves_financial_approval_alone(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")
    await payment(client, auth_headers, lead_id)
    assert (await move(client, auth_headers, lead_id, "financial_approval")).status_code == 200

    body = await token(client, auth_headers, lead_id)

    assert body["status"] == "financial_approval"


async def test_token_amount_by_hand_needs_the_token(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")
    # A payment isn't a token.
    await payment(client, auth_headers, lead_id)

    response = await move(client, auth_headers, lead_id, "token_amount")

    assert response.status_code == 400
    assert "token amount" in response.json()["message"].lower()


async def test_back_from_financial_approval_to_token_amount_asks_why(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")
    await token(client, auth_headers, lead_id)
    await move(client, auth_headers, lead_id, "financial_approval")

    refused = await move(client, auth_headers, lead_id, "token_amount")
    allowed = await move(client, auth_headers, lead_id, "token_amount", stage_change_reason="Rest due on the 21st")

    assert refused.status_code == 400
    assert allowed.status_code == 200, allowed.text


async def test_a_payment_reminder_leaves_a_token_payer_where_they_are(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130")
    await token(client, auth_headers, lead_id)

    lead = await LeadService().move_to_follow_up(uuid.UUID(lead_id), actor_id=None)

    assert lead.status == "token_amount"


async def test_the_token_stays_while_the_lead_is_in_token_amount(client, auth_headers, uploads):
    """Even with a payment beside it - the token is what the stage is for."""
    lead_id = await planned_lead(client, auth_headers, "7305341130")
    await token(client, auth_headers, lead_id)
    await payment(client, auth_headers, lead_id)

    response = await delete_payment(client, auth_headers, lead_id, 0)

    assert response.status_code == 400
    assert "earlier stage" in response.json()["message"]


async def test_partially_paid_leads_and_early_token_payers_move_once(client, auth_headers, uploads):
    part_with_token = await planned_lead(client, auth_headers, "7305341130")
    part_without = await planned_lead(client, auth_headers, "7868076669")
    follow_up_with_token = await planned_lead(client, auth_headers, "9940123456")
    approved_with_token = await planned_lead(client, auth_headers, "9884012345")
    for lead_id in (part_with_token, follow_up_with_token, approved_with_token):
        await token(client, auth_headers, lead_id)
    await payment(client, auth_headers, part_without)
    await set_status(part_with_token, "partially_paid")
    await set_status(part_without, "partially_paid")
    await set_status(follow_up_with_token, "pre_screening")
    await set_status(approved_with_token, "financial_approval")
    await Lead.get_motor_collection().update_one(
        {"_id": uuid.UUID(part_without)}, {"$set": {"finance_approved_at": "2026-10-30T10:00:00"}}
    )

    assert await move_partially_paid_to_token_amount() == 3

    async def raw(lead_id):
        return await Lead.get_motor_collection().find_one({"_id": uuid.UUID(lead_id)})

    assert (await raw(part_with_token))["status"] == "token_amount"
    assert (await raw(follow_up_with_token))["status"] == "token_amount"
    # No token: back where part-payers sat before Partially Paid, waiting for Finance.
    without = await raw(part_without)
    assert without["status"] == "financial_approval" and without["finance_approved_at"] is None
    # Past Token Amount already: left alone.
    assert (await raw(approved_with_token))["status"] == "financial_approval"
    # On the timeline, with where it came from and why.
    entry = await AuditLog.find_one({"entity_id": part_without, "changes.status": "financial_approval"})
    assert entry.changes["previous_status"] == "partially_paid" and entry.changes["reason"]
    # Once only: a token payer moved back to Follow up call later stays there.
    await set_status(follow_up_with_token, "pre_screening")
    assert await move_partially_paid_to_token_amount() == 0
