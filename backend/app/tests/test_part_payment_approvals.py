"""Finance's approval of a fee paid in parts.

The first payment goes through Financial Approval and puts the student in Batch
Confirmation, where they attend class however little it was. Every payment
after that still goes to Finance, with the student left where they are.
"""
import asyncio
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest

from app.database.backfills import backfill_payment_approvals
from app.models.audit_log import AuditLog
from app.models.enums import StudentStatus
from app.models.lead import Lead
from app.models.student import Student
from app.services.student_enrollment_service import StudentEnrollmentService
from app.tests.test_part_payment import pay, planned_lead

DUE = "2026-12-27"


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def listed(client, auth_headers, **params) -> list[str]:
    response = await client.get("/api/v1/leads", headers=auth_headers, params=params)
    assert response.status_code == 200, response.text
    return [lead["id"] for lead in response.json()["items"]]


async def awaiting(client, auth_headers) -> list[str]:
    return await listed(client, auth_headers, awaiting_finance="true")


async def approved(client, auth_headers) -> list[str]:
    return await listed(client, auth_headers, finance_approved="true", sort_by="finance_approved_at")


async def move(client, auth_headers, lead_id: str, status: str, **data):
    response = await client.put(
        f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": status, **data}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def approve(client, auth_headers, lead_id: str):
    return await client.post(f"/api/v1/leads/{lead_id}/finance-approve", headers=auth_headers)


async def reject(client, auth_headers, lead_id: str, reason: str = "Not credited to the bank"):
    return await client.post(
        f"/api/v1/leads/{lead_id}/finance-reject", headers=auth_headers, json={"reason": reason}
    )


async def in_class(client, auth_headers, first: str = "5000") -> str:
    """A student whose first payment Finance has approved."""
    lead_id = await planned_lead(client, auth_headers)
    paid = await pay(client, auth_headers, lead_id, received_amount=first, balance_due_at=DUE)
    assert paid.status_code == 200, paid.text
    # Saving it is what sent it to Finance.
    assert paid.json()["status"] == "financial_approval"
    response = await approve(client, auth_headers, lead_id)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "batch_confirmation"
    return lead_id


async def test_a_second_payment_goes_to_finance_and_the_student_stays_in_batch_confirmation(
    client, auth_headers, uploads
):
    lead_id = await in_class(client, auth_headers)
    assert await awaiting(client, auth_headers) == []
    assert await approved(client, auth_headers) == [lead_id]

    body = (await pay(client, auth_headers, lead_id, received_amount="7000")).json()

    assert body["status"] == "batch_confirmation"
    first, second, _balance = body["installments"]
    assert first["finance_approved_at"] and not second["finance_approved_at"]
    # On one of Finance's tabs, not both.
    assert await awaiting(client, auth_headers) == [lead_id]
    assert await approved(client, auth_headers) == []


async def test_approving_the_second_payment_leaves_the_first_approval_alone(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    before = (await pay(client, auth_headers, lead_id, received_amount="7000")).json()

    response = await approve(client, auth_headers, lead_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "batch_confirmation"
    assert body["installments"][0]["finance_approved_at"] == before["installments"][0]["finance_approved_at"]
    assert body["installments"][1]["finance_approved_at"] and body["installments"][1]["finance_approved_by_name"]
    assert await awaiting(client, auth_headers) == []
    assert await approved(client, auth_headers) == [lead_id]
    # What is owed is worked out from the payments, untouched by approval.
    assert float(body["installments"][2]["amount"]) == 3000


async def test_every_later_payment_is_approved_on_its_own(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    for amount in ("7000", "2000", "1000"):
        await pay(client, auth_headers, lead_id, received_amount=amount)
        assert await awaiting(client, auth_headers) == [lead_id]
        assert (await approve(client, auth_headers, lead_id)).status_code == 200
        assert await awaiting(client, auth_headers) == []

    again = await approve(client, auth_headers, lead_id)

    assert again.status_code == 400


async def test_one_rupee_is_enough_for_class_and_a_later_payment_does_not_interrupt_it(
    client, auth_headers, uploads
):
    lead_id = await in_class(client, auth_headers, first="1")
    await StudentEnrollmentService().sync()
    student = await Student.find_one({"lead_id": uuid.UUID(lead_id)})
    assert student.status == StudentStatus.ACTIVE

    await pay(client, auth_headers, lead_id, received_amount="10000")
    await StudentEnrollmentService().sync()
    assert (await Student.get(student.id)).status == StudentStatus.ACTIVE

    assert (await reject(client, auth_headers, lead_id)).status_code == 200
    await StudentEnrollmentService().sync()
    assert (await Student.get(student.id)).status == StudentStatus.ACTIVE


async def test_rejecting_marks_the_payment_and_keeps_the_student_in_class(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")

    response = await reject(client, auth_headers, lead_id, "Screenshot is of another payment")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "batch_confirmation"
    first, second, _balance = body["installments"]
    assert first["finance_approved_at"] and not first["finance_rejected_at"]
    assert second["finance_rejected_reason"] == "Screenshot is of another payment"
    assert second["finance_rejected_by_name"] and not second["finance_approved_at"]
    assert await awaiting(client, auth_headers) == []
    assert await approved(client, auth_headers) == [lead_id]


async def test_correcting_a_rejected_payment_sends_it_back_to_finance(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")
    await reject(client, auth_headers, lead_id)

    # Nothing but a remark: the save itself is the answer to the rejection.
    response = await client.post(
        f"/api/v1/leads/{lead_id}/payments/1", headers=auth_headers, data={"remarks": "Credited now"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["installments"][1]["finance_rejected_at"] is None
    assert await awaiting(client, auth_headers) == [lead_id]


async def test_changing_an_approved_amount_needs_approval_again(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)

    await client.post(f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, data={"remarks": "Paid by father"})
    assert await awaiting(client, auth_headers) == []

    await client.post(f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, data={"received_amount": "6000"})
    assert await awaiting(client, auth_headers) == [lead_id]


async def test_reject_is_only_for_a_waiting_payment_and_needs_a_reason(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    assert (await reject(client, auth_headers, lead_id)).status_code == 400

    await pay(client, auth_headers, lead_id, received_amount="7000")
    assert (await reject(client, auth_headers, lead_id, "   ")).status_code in (400, 422)

    other = await planned_lead_awaiting(client, auth_headers)
    assert (await reject(client, auth_headers, other)).status_code == 400


async def planned_lead_awaiting(client, auth_headers) -> str:
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": "Harini",
            "phone": "6382857019",
            "program_interest": "recruitment_internship",
            "payment_plan": "single_shot",
        },
    )
    lead_id = created.json()["id"]
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at=DUE)
    return lead_id


@pytest.mark.parametrize("stage", ["new_lead", "rnr", "pre_screening"])
async def test_saving_a_payment_sends_it_to_finance_from_any_earlier_stage(client, auth_headers, uploads, stage):
    lead_id = await planned_lead(client, auth_headers)
    if stage != "new_lead":
        await move(client, auth_headers, lead_id, stage)

    body = (await pay(client, auth_headers, lead_id, received_amount="1500", balance_due_at=DUE)).json()

    assert body["status"] == "financial_approval"
    assert await awaiting(client, auth_headers) == [lead_id]


async def test_the_full_fee_at_once_is_approved_once_and_stays_in_batch_confirmation(
    client, auth_headers, uploads
):
    lead_id = await in_class(client, auth_headers, first="15000")

    body = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()

    assert body["status"] == "batch_confirmation"
    assert [entry["kind"] for entry in body["installments"]] == ["payment"]
    assert await awaiting(client, auth_headers) == []


async def test_a_token_alone_waits_for_a_payment(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    await pay(client, auth_headers, lead_id, proof=False, kind="token", received_amount="500", balance_due_at=DUE)
    assert await awaiting(client, auth_headers) == []

    await pay(client, auth_headers, lead_id, received_amount="1500")
    assert await awaiting(client, auth_headers) == [lead_id]


async def test_a_correction_does_not_move_a_lead_that_was_sent_back(client, auth_headers, uploads):
    lead_id = await planned_lead_awaiting(client, auth_headers)
    await move(client, auth_headers, lead_id, "pre_screening", stage_change_reason="Not credited yet")

    response = await client.post(
        f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, data={"remarks": "Asked for the reference"}
    )
    assert response.json()["status"] == "pre_screening"
    assert await awaiting(client, auth_headers) == []

    # The payment card's Send to Finance.
    await move(client, auth_headers, lead_id, "financial_approval")
    assert await awaiting(client, auth_headers) == [lead_id]
    assert (await approve(client, auth_headers, lead_id)).json()["installments"][0]["finance_approved_at"]


async def test_a_payment_from_a_student_put_back_to_follow_up_goes_through_financial_approval(
    client, auth_headers, uploads
):
    lead_id = await in_class(client, auth_headers)
    await move(client, auth_headers, lead_id, "pre_screening", stage_change_reason="Call for the balance")

    body = (await pay(client, auth_headers, lead_id, received_amount="7000")).json()

    assert body["status"] == "financial_approval" and body["finance_approved_at"] is None
    assert await awaiting(client, auth_headers) == [lead_id]
    assert await approved(client, auth_headers) == []
    body = (await approve(client, auth_headers, lead_id)).json()
    assert body["status"] == "batch_confirmation"


async def test_awaiting_lists_first_and_later_payments_and_nobody_before_financial_approval(
    client, auth_headers, uploads
):
    student = await in_class(client, auth_headers)
    await pay(client, auth_headers, student, received_amount="7000")
    new = await planned_lead_awaiting(client, auth_headers)
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": "Early",
            "phone": "9000000001",
            "program_interest": "recruitment_internship",
            "payment_plan": "single_shot",
        },
    )
    # Only the token so far, which isn't sent to Finance by itself.
    await pay(
        client, auth_headers, created.json()["id"],
        proof=False, kind="token", received_amount="500", balance_due_at=DUE,
    )

    assert set(await awaiting(client, auth_headers)) == {student, new}
    # Search narrows the tab; its own $or must not replace the tab's.
    assert await listed(client, auth_headers, awaiting_finance="true", search="Harini") == [new]


async def test_a_student_moved_into_batch_confirmation_by_hand_still_goes_to_finance(
    client, auth_headers, uploads
):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at=DUE)
    await move(client, auth_headers, lead_id, "batch_confirmation")
    assert await awaiting(client, auth_headers) == [lead_id]

    response = await approve(client, auth_headers, lead_id)

    assert response.status_code == 200, response.text
    assert await approved(client, auth_headers) == [lead_id]


async def test_a_quit_student_is_not_listed(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")

    await move(client, auth_headers, lead_id, "lost", lost_reason="Moved city")

    assert await awaiting(client, auth_headers) == []


async def test_each_decision_is_on_the_timeline_with_its_amount(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")
    await reject(client, auth_headers, lead_id, "Not credited")

    timeline = (await client.get(f"/api/v1/leads/{lead_id}/timeline", headers=auth_headers)).json()

    by_action = {entry["action"]: entry["changes"] for entry in timeline}
    assert by_action["APPROVE_PAYMENT"]["payment"] == "Payment 1"
    assert float(by_action["APPROVE_PAYMENT"]["received_amount"]) == 5000
    assert by_action["REJECT_PAYMENT"]["payment"] == "Payment 2"
    assert by_action["REJECT_PAYMENT"]["reason"] == "Not credited"


async def test_the_admission_date_stays_the_first_approval(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    lead = await Lead.get(uuid.UUID(lead_id))
    lead.installments[0].finance_approved_at -= timedelta(days=5)
    first = lead.installments[0].finance_approved_at
    await lead.save()
    await pay(client, auth_headers, lead_id, received_amount="7000")
    await approve(client, auth_headers, lead_id)

    await StudentEnrollmentService().sync()

    student = await Student.find_one({"lead_id": uuid.UUID(lead_id)})
    assert abs((student.admission_date - first.date()).days) <= 1


# ---------- Payments from before approval was held on each one ----------


async def as_before_the_field(lead_id: str) -> Lead:
    """Strips the per-payment approval, as every stored payment had none."""
    lead = await Lead.get(uuid.UUID(lead_id))
    for entry in lead.installments:
        entry.clear_finance_check()
    await lead.save()
    return lead


async def test_backfill_approves_what_the_lead_approval_covered_and_leaves_the_rest_for_finance(
    client, auth_headers, uploads
):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")
    lead = await as_before_the_field(lead_id)
    # Approved five days after the first payment; the second came five days on.
    lead.installments[0].paid_at -= timedelta(days=10)
    lead.finance_approved_at -= timedelta(days=5)
    await lead.save()

    assert await backfill_payment_approvals() == 1

    lead = await Lead.get(uuid.UUID(lead_id))
    assert lead.installments[0].finance_approved_at == lead.finance_approved_at
    assert lead.installments[0].finance_approved_by_name == lead.finance_approved_by_name
    assert lead.installments[1].finance_approved_at is None
    assert await awaiting(client, auth_headers) == [lead_id]
    # Once only.
    assert await backfill_payment_approvals() == 0


async def test_backfill_tells_payments_of_the_approval_day_apart_by_the_log(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="7000")
    await as_before_the_field(lead_id)

    assert await backfill_payment_approvals() == 1

    lead = await Lead.get(uuid.UUID(lead_id))
    assert lead.installments[0].finance_approved_at and not lead.installments[1].finance_approved_at


async def test_every_worker_starting_at_once_can_run_the_backfill(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await as_before_the_field(lead_id)

    # Production starts four; one that raised would take the service down.
    await asyncio.gather(*(backfill_payment_approvals() for _ in range(4)))

    lead = await Lead.get(uuid.UUID(lead_id))
    assert lead.installments[0].finance_approved_at == lead.finance_approved_at


async def test_backfill_skips_a_lead_it_cannot_read(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await as_before_the_field(lead_id)
    unreadable = {**await Lead.get_motor_collection().find_one({"_id": uuid.UUID(lead_id)})}
    unreadable.update(_id=uuid.uuid4(), status="partially_paid")
    await Lead.get_motor_collection().insert_one(unreadable)

    assert await backfill_payment_approvals() == 1


async def test_backfill_counts_a_payment_the_log_does_not_have_as_approved(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await as_before_the_field(lead_id)
    await AuditLog.get_motor_collection().delete_many({})

    assert await backfill_payment_approvals() == 1
    assert await awaiting(client, auth_headers) == []


async def test_approval_does_not_change_the_money(client, auth_headers, uploads):
    lead_id = await in_class(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000")
    await approve(client, auth_headers, lead_id)

    lead = await Lead.get(uuid.UUID(lead_id))
    assert [entry.amount for entry in lead.installments] == [Decimal(5000), Decimal(10000)]
    assert [entry.gst_amount for entry in lead.installments] == [Decimal(900), Decimal(1800)]
