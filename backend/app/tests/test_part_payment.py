"""The payment collection on a Foundation lead.

The plan prices the fee; the money is recorded as it comes in - an optional
token up front, then as many payments as it takes - and whatever is left is
the balance, due on the date the student promised.
"""
from datetime import date
from decimal import Decimal

import pytest

from app.models.lead import PaymentInstallment
from app.services.payment_ledger import to_ledger

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16
PROOF = [("files", ("proof.png", PNG, "image/png"))]


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def planned_lead(client, auth_headers, plan: str = "single_shot") -> str:
    # The catalog read seeds the programs collection, which the create validates against.
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": "Sha Prasanna",
            "phone": "7395818457",
            "program_interest": "recruitment_internship",
            "payment_plan": plan,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def pay(client, auth_headers, lead_id: str, *, proof=True, **data):
    return await client.post(
        f"/api/v1/leads/{lead_id}/payments",
        headers=auth_headers,
        data={"mode": "upi", **data},
        files=PROOF if proof else None,
    )


def amounts(body) -> list[tuple[str, float]]:
    return [(entry["kind"], float(entry["amount"])) for entry in body["installments"]]


async def test_a_new_plan_starts_with_the_whole_fee_due(client, auth_headers):
    lead_id = await planned_lead(client, auth_headers, plan="emi_6_weeks")

    body = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()

    # No week slots: one balance of everything the six weeks add up to.
    assert len(body["installments"]) == 1
    balance = body["installments"][0]
    assert balance["kind"] == "balance" and balance["paid"] is False
    assert float(balance["amount"]) > 0


async def test_a_payment_leaves_the_rest_due_on_the_promised_date(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    assert response.status_code == 200, response.text
    body = response.json()
    assert amounts(body) == [("payment", 10000), ("balance", 5000)]
    payment, balance = body["installments"]
    assert payment["label"] == "Payment 1" and payment["paid"] is True and payment["paid_at"]
    assert balance["scheduled_at"] == "2026-09-27"


async def test_a_payment_that_leaves_a_balance_needs_its_date(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="10000")

    assert response.status_code == 400
    assert "remaining" in response.json()["message"].lower()


async def test_payments_add_up_until_nothing_is_due(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, plan="two_shot")
    fee = float((await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()["installments"][0]["amount"])
    await pay(client, auth_headers, lead_id, received_amount="4000", balance_due_at="2026-09-27")

    response = await pay(client, auth_headers, lead_id, received_amount=str(fee - 4000))

    assert response.status_code == 200, response.text
    body = response.json()
    # Fully paid: no balance left, and every entry is paid.
    assert amounts(body) == [("payment", 4000), ("payment", fee - 4000)]
    assert [entry["label"] for entry in body["installments"]] == ["Payment 1", "Payment 2"]


async def test_a_payment_cannot_be_more_than_is_due(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="99999")

    assert response.status_code == 400
    assert "still due" in response.json()["message"]


async def test_a_payment_needs_a_proof(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, proof=False, received_amount="15000")

    assert response.status_code == 400
    assert "proof" in response.json()["message"].lower()


async def test_the_token_comes_first_and_its_proof_is_optional(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")

    response = await pay(client, auth_headers, lead_id, proof=False, kind="token", received_amount="1000")

    assert response.status_code == 200, response.text
    body = response.json()
    assert amounts(body) == [("token", 1000), ("payment", 5000), ("balance", 9000)]
    assert body["installments"][0]["label"] == "Token Amount"
    # The balance keeps the date it was promised for.
    assert body["installments"][-1]["scheduled_at"] == "2026-09-27"

    again = await pay(client, auth_headers, lead_id, kind="token", received_amount="500")
    assert again.status_code == 400


async def test_a_recorded_payment_can_be_corrected(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    first = (await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")).json()
    proof = first["installments"][0]["proof_urls"][0]

    response = await client.post(
        f"/api/v1/leads/{lead_id}/payments/0",
        headers=auth_headers,
        data={"received_amount": "12000", "remove_proof_urls": proof, "remarks": "Typo on the first save"},
        files=[("files", ("a.png", PNG, "image/png")), ("files", ("b.png", PNG, "image/png"))],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert amounts(body) == [("payment", 12000), ("balance", 3000)]
    payment = body["installments"][0]
    assert len(payment["proof_urls"]) == 2 and proof not in payment["proof_urls"]
    assert payment["remarks"] == "Typo on the first save"
    assert payment["paid_at"] == first["installments"][0]["paid_at"]


async def test_the_balance_takes_a_date_and_a_remark(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    response = await client.put(
        f"/api/v1/leads/{lead_id}/balance",
        headers=auth_headers,
        json={"due_at": "2026-10-05", "remarks": "Salary on the 5th"},
    )

    assert response.status_code == 200, response.text
    balance = response.json()["installments"][-1]
    assert balance["kind"] == "balance"
    assert balance["scheduled_at"] == "2026-10-05" and balance["remarks"] == "Salary on the 5th"


async def test_changing_the_plan_keeps_what_was_paid(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers, plan="single_shot")
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")

    response = await client.post(
        f"/api/v1/leads/{lead_id}/plan",
        headers=auth_headers,
        json={"program_interest": "recruitment_internship", "payment_plan": "two_shot"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_plan"] == "two_shot"
    payment, balance = body["installments"]
    assert payment["kind"] == "payment" and float(payment["amount"]) == 5000
    assert balance["kind"] == "balance" and balance["scheduled_at"] == "2026-09-27"


async def test_a_payment_is_enough_for_financial_approval(client, auth_headers, uploads):
    """Financial Approval asks whether money has landed, not whether it's all in."""
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})

    response = await client.put(
        f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "financial_approval"}
    )

    assert response.status_code == 200, response.text


async def test_the_qr_code_is_picked_with_the_payment(client, auth_headers, uploads):
    """Picked in the payment card, not the board - and mirrored onto the lead,
    which is what the board's QR filter reads."""
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="15000", qr_code="Chitra-Axis")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["installments"][0]["qr_code"] == "Chitra-Axis"
    assert body["qr_code"] == "Chitra-Axis"
    found = await client.get("/api/v1/leads", headers=auth_headers, params={"qr_code": "Chitra-Axis"})
    assert [lead["id"] for lead in found.json()["items"]] == [lead_id]


async def test_statistics_count_what_the_payments_recorded(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    response = await client.get(
        "/api/v1/leads/analytics", headers=auth_headers, params={"dimension": "course"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["collected"] == 10000


def test_old_plan_slots_convert_without_losing_money():
    """What the startup backfill does to a lead still on week slots: what was
    received becomes payments, what was owed becomes the balance."""
    week = Decimal("3300")
    slots = [
        PaymentInstallment(label="Week 1", amount=week, mode="upi", proof_url="/p1.png", paid=True),
        # Part-paid, the rest promised for a date.
        PaymentInstallment(
            label="Week 2", amount=week, received_amount=Decimal("1000"), mode="upi",
            proof_urls=["/p2.png"], scheduled_at=date(2026, 9, 27),
        ),
        # Details typed in, no proof yet: nothing was collected.
        PaymentInstallment(label="Week 3", amount=week, mode="card", transaction_id="TXN-3"),
        *[PaymentInstallment(label=f"Week {n}", amount=week) for n in (4, 5, 6)],
    ]

    ledger = to_ledger(slots)

    assert [(entry.kind, entry.amount) for entry in ledger] == [
        ("payment", week),
        ("payment", Decimal("1000")),
        ("balance", week * 6 - week - Decimal("1000")),
    ]
    assert ledger[0].proof_url == "/p1.png" and ledger[1].label == "Payment 2"
    assert ledger[-1].scheduled_at == date(2026, 9, 27)
    # Converting again changes nothing.
    assert to_ledger(ledger) == ledger
