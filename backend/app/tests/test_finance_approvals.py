"""Finance's Income Approvals: Awaiting Approval, and Approved Students.

Approving records that Finance approved and moves the lead to Batch
Confirmation; the Approved Students tab lists what Finance approved, not
whatever happens to be sitting in that stage.
"""
import uuid

from app.database.backfills import backfill_finance_approvals
from app.models.lead import Lead


async def awaiting_lead(client, auth_headers, phone: str = "9876543210") -> str:
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Benazir Fathima", "phone": phone, "course_interest": "HR Recruitment"},
    )
    lead_id = created.json()["id"]
    # Financial Approval needs money on record first.
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"paid_amount": "5000"})
    moved = await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "financial_approval"})
    assert moved.status_code == 200, moved.text
    return lead_id


async def listed(client, auth_headers, **params) -> list[str]:
    response = await client.get("/api/v1/leads", headers=auth_headers, params=params)
    return [lead["id"] for lead in response.json()["items"]]


async def test_approving_moves_the_lead_to_approved_students(client, auth_headers):
    lead_id = await awaiting_lead(client, auth_headers)

    response = await client.post(f"/api/v1/leads/{lead_id}/finance-approve", headers=auth_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "batch_confirmation"
    assert body["finance_approved_at"] is not None
    assert body["finance_approved_by_name"]
    assert await listed(client, auth_headers, finance_approved="true") == [lead_id]
    assert await listed(client, auth_headers, status="financial_approval") == []


async def test_only_a_lead_awaiting_approval_can_be_approved(client, auth_headers):
    created = await client.post(
        "/api/v1/leads", headers=auth_headers, json={"name": "Harini", "phone": "6382857019"}
    )

    response = await client.post(f"/api/v1/leads/{created.json()['id']}/finance-approve", headers=auth_headers)

    assert response.status_code == 400


async def test_a_lead_moved_into_batch_confirmation_by_hand_is_not_approved(client, auth_headers):
    """The stage can be reached without Finance now; the tab only lists what
    Finance approved."""
    lead_id = await awaiting_lead(client, auth_headers)

    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "batch_confirmation"})

    assert await listed(client, auth_headers, finance_approved="true") == []


async def test_coming_back_for_approval_clears_the_old_one(client, auth_headers):
    lead_id = await awaiting_lead(client, auth_headers)
    await client.post(f"/api/v1/leads/{lead_id}/finance-approve", headers=auth_headers)

    response = await client.put(
        f"/api/v1/leads/{lead_id}",
        headers=auth_headers,
        json={"status": "financial_approval", "stage_change_reason": "Second payment to check"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["finance_approved_at"] is None
    assert await listed(client, auth_headers, finance_approved="true") == []
    assert await listed(client, auth_headers, status="financial_approval") == [lead_id]


async def test_students_approved_before_approvals_were_recorded_are_backfilled(client, auth_headers):
    approved = await awaiting_lead(client, auth_headers, phone="7305341130")
    # The old Approve: a plain move to Batch Confirmation, on the audit log.
    await client.put(f"/api/v1/leads/{approved}", headers=auth_headers, json={"status": "batch_confirmation"})
    waiting = await awaiting_lead(client, auth_headers, phone="7868076669")

    assert await backfill_finance_approvals() == 1

    lead = await Lead.find_one({"_id": uuid.UUID(approved)})
    assert lead.finance_approved_at is not None and lead.finance_approved_by_name
    assert await listed(client, auth_headers, finance_approved="true") == [approved]
    assert waiting not in await listed(client, auth_headers, finance_approved="true")
    # Once only.
    assert await backfill_finance_approvals() == 0
