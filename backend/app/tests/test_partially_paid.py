"""The Partially Paid stage, between Follow up call and Financial Approval.

Set by hand, and like the stages after it only once money is on record. The
leads that sat in Financial Approval owing money before it existed are moved
into it once, on startup.
"""
import uuid

import pytest

from app.database.backfills import move_part_payers_to_partially_paid
from app.models.audit_log import AuditLog
from app.models.lead import Lead
from app.services.lead_service import LeadService

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def planned_lead(client, auth_headers, phone: str, *, received: str | None = None) -> str:
    """A single-shot ₹15,000 lead, with `received` paid against it if given."""
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)  # seeds programs
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Benazir Fathima", "phone": phone, "program_interest": "recruitment_internship", "payment_plan": "single_shot"},
    )
    lead_id = created.json()["id"]
    if received:
        paid = await client.post(
            f"/api/v1/leads/{lead_id}/payments",
            headers=auth_headers,
            data={"mode": "upi", "received_amount": received, "balance_due_at": "2026-10-21"},
            files=[("files", ("proof.png", PNG, "image/png"))],
        )
        assert paid.status_code == 200, paid.text
    return lead_id


async def move(client, auth_headers, lead_id: str, status: str, **extra):
    return await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": status, **extra})


async def test_partially_paid_needs_a_payment_on_record(client, auth_headers):
    lead_id = await planned_lead(client, auth_headers, "7305341130")

    response = await move(client, auth_headers, lead_id, "partially_paid")

    assert response.status_code == 400
    assert "partially paid" in response.json()["message"].lower()


async def test_a_part_payer_can_be_moved_to_partially_paid(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130", received="8750")

    response = await move(client, auth_headers, lead_id, "partially_paid")

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "partially_paid"
    stats = (await client.get("/api/v1/leads/stats", headers=auth_headers)).json()
    assert stats["by_status"]["partially_paid"] == 1


async def test_back_from_financial_approval_to_partially_paid_asks_why(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130", received="8750")
    await move(client, auth_headers, lead_id, "financial_approval")

    refused = await move(client, auth_headers, lead_id, "partially_paid")
    allowed = await move(client, auth_headers, lead_id, "partially_paid", stage_change_reason="Rest due on the 21st")

    assert refused.status_code == 400
    assert allowed.status_code == 200, allowed.text


async def test_a_payment_reminder_leaves_a_part_payer_where_they_are(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, "7305341130", received="8750")
    await move(client, auth_headers, lead_id, "partially_paid")

    lead = await LeadService().move_to_follow_up(uuid.UUID(lead_id), actor_id=None)

    assert lead.status == "partially_paid"


async def test_part_payers_waiting_in_financial_approval_move_once(client, auth_headers, uploads):
    owing = await planned_lead(client, auth_headers, "7305341130", received="8750")
    settled = await planned_lead(client, auth_headers, "7868076669", received="15000")
    for lead_id in (owing, settled):
        await move(client, auth_headers, lead_id, "financial_approval")

    assert await move_part_payers_to_partially_paid() == 1

    assert (await Lead.find_one({"_id": uuid.UUID(owing)})).status == "partially_paid"
    # Fully paid: nothing owed, so it stays for Finance to approve.
    assert (await Lead.find_one({"_id": uuid.UUID(settled)})).status == "financial_approval"
    # On the timeline as a move back, with the reason.
    entry = await AuditLog.find_one({"entity_id": owing, "action": "STAGE_BACK"})
    assert entry.changes["previous_status"] == "financial_approval" and entry.changes["reason"]
    # Once only: a part-payer moved back to Financial Approval later stays there.
    await move(client, auth_headers, owing, "financial_approval")
    assert await move_part_payers_to_partially_paid() == 0
