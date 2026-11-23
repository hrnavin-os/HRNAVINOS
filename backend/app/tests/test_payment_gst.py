"""GST on the payment collection.

Every token and payment has 18% collected on top of it. The GST is recorded
beside the amount and is never part of the fee: what is still due, what counts
as collected and whether the student has paid in full are all read without it.
"""
from decimal import Decimal

import pytest

from app.models.audit_log import AuditLog
from app.models.enums import PaymentEntryKind
from app.models.lead import Lead, PaymentInstallment
from app.services.payment_ledger import GST_RATE, gst_on, rebalance
from app.tests.test_part_payment import amounts, pay, planned_lead


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def test_gst_is_18_percent_to_the_paisa():
    assert GST_RATE == 18
    assert gst_on(Decimal("10000"), GST_RATE) == Decimal("1800.00")
    assert gst_on(Decimal("3333"), GST_RATE) == Decimal("599.94")
    # Half a paisa rounds up, as the form's preview does.
    assert gst_on(Decimal("1.25"), GST_RATE) == Decimal("0.23")


async def test_a_payment_carries_gst_on_top_of_its_amount(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    assert response.status_code == 200, response.text
    payment, balance = response.json()["installments"]
    assert float(payment["received_amount"]) == 10000
    assert float(payment["gst_rate"]) == 18 and float(payment["gst_amount"]) == 1800
    # The fee is untouched by it: 15,000 less the 10,000.
    assert float(balance["amount"]) == 5000
    # Nothing has been collected against the balance, so it carries no GST.
    assert balance["gst_amount"] is None


async def test_the_token_carries_gst_too(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(
        client, auth_headers, lead_id, proof=False, kind="token", received_amount="1000", balance_due_at="2026-09-27"
    )

    assert response.status_code == 200, response.text
    assert float(response.json()["installments"][0]["gst_amount"]) == 180


async def test_the_whole_fee_can_be_paid_and_gst_is_not_counted_against_it(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="15000")

    assert response.status_code == 200, response.text
    body = response.json()
    # Fully paid, with no balance, though 17,700 changed hands.
    assert amounts(body) == [("payment", 15000)]
    assert float(body["installments"][0]["gst_amount"]) == 2700


async def test_correcting_the_amount_works_the_gst_out_again(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    response = await client.post(
        f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, data={"received_amount": "12000"}
    )

    assert response.status_code == 200, response.text
    assert float(response.json()["installments"][0]["gst_amount"]) == 2160


async def test_a_correction_keeps_the_rate_it_was_collected_at(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")
    lead = await Lead.find_one()
    lead.installments[0].gst_rate = Decimal(12)
    await lead.save()

    response = await client.post(
        f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, data={"received_amount": "5000"}
    )

    assert response.status_code == 200, response.text
    assert float(response.json()["installments"][0]["gst_amount"]) == 600


async def test_a_payment_from_before_gst_never_gains_any(client, auth_headers, uploads):
    """It was collected without GST, so correcting its remark or its amount
    must not say tax was taken - while the next payment does carry it."""
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="5000", balance_due_at="2026-09-27")
    lead = await Lead.find_one()
    lead.installments[0].gst_rate = None
    lead.installments[0].gst_amount = None
    await lead.save()

    corrected = await client.post(
        f"/api/v1/leads/{lead_id}/payments/0",
        headers=auth_headers,
        data={"received_amount": "6000", "remarks": "Checked"},
    )
    following = await pay(client, auth_headers, lead_id, received_amount="4000")

    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["installments"][0]["gst_amount"] is None
    old, new, _ = following.json()["installments"]
    assert old["gst_amount"] is None and float(new["gst_amount"]) == 720


async def test_gst_cannot_be_set_by_whoever_records_the_payment(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="15000", gst_amount="1", gst_rate="0")

    assert float(response.json()["installments"][0]["gst_amount"]) == 2700


async def test_statistics_count_the_fee_collected_without_the_gst(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")

    response = await client.get("/api/v1/leads/analytics", headers=auth_headers, params={"dimension": "course"})

    assert response.json()["items"][0]["collected"] == 10000


async def test_finance_reads_the_gst_on_its_rows(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "financial_approval"})

    finance = await client.get("/api/v1/leads/finance", headers=auth_headers)
    approvals = await client.get("/api/v1/leads", headers=auth_headers, params={"status": "financial_approval"})

    assert float(finance.json()[0]["installments"][0]["gst_amount"]) == 1800
    assert float(approvals.json()["items"][0]["installments"][0]["gst_amount"]) == 1800


async def test_the_audit_log_keeps_the_gst(client, auth_headers, uploads):
    lead_id = await planned_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", balance_due_at="2026-09-27")
    await client.request(
        "DELETE", f"/api/v1/leads/{lead_id}/payments/0", headers=auth_headers, json={"reason": "Added by mistake"}
    )

    logs = await AuditLog.find_all().to_list()
    recorded = [log.changes["gst_amount"] for log in logs if "gst_amount" in (log.changes or {})]

    # Once for the payment, once for its deletion.
    assert recorded == ["1800.00", "1800.00"]


def test_rebalancing_keeps_the_gst_on_what_was_received():
    entry = PaymentInstallment(
        kind=PaymentEntryKind.PAYMENT,
        label="Payment",
        amount=Decimal(100),
        received_amount=Decimal(100),
        gst_rate=GST_RATE,
        gst_amount=Decimal(18),
        paid=True,
    )

    ledger = rebalance([entry], Decimal(500))

    assert ledger[0].gst_amount == 18
    assert ledger[-1].amount == 400 and ledger[-1].gst_amount is None
