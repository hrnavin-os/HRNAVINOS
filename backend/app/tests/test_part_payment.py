"""Part-payment against an installment.

The payment method is only the label - a single-shot student can pay ₹10,000
now and the rest in two days. What was received is keyed in by hand, the fee
stays the program's, and the shortfall stays due until the date promised.
"""
import pytest

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def single_shot_lead(client, auth_headers) -> str:
    # The catalog read seeds the programs collection, which the create validates against.
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={
            "name": "Sha Prasanna",
            "phone": "7395818457",
            "program_interest": "recruitment_internship",
            "payment_plan": "single_shot",
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def pay(client, auth_headers, lead_id: str, **data):
    return await client.post(
        f"/api/v1/leads/{lead_id}/installments/0",
        headers=auth_headers,
        data={"mode": "upi", **data},
        files=[("files", ("proof.png", PNG, "image/png"))],
    )


async def test_a_part_payment_leaves_the_balance_due_on_the_promised_date(client, auth_headers, uploads):
    lead_id = await single_shot_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="10000", scheduled_at="2026-09-27")

    assert response.status_code == 200, response.text
    installment = response.json()["installments"][0]
    # The fee is still the program's; only what came in is the typed amount.
    assert float(installment["amount"]) == 15000
    assert float(installment["received_amount"]) == 10000
    assert installment["paid"] is False
    assert installment["scheduled_at"] == "2026-09-27"


async def test_a_part_payment_needs_a_date_for_the_balance(client, auth_headers, uploads):
    lead_id = await single_shot_lead(client, auth_headers)

    response = await pay(client, auth_headers, lead_id, received_amount="10000")

    assert response.status_code == 400
    assert "balance" in response.json()["message"].lower()


async def test_paying_the_balance_settles_the_installment(client, auth_headers, uploads):
    lead_id = await single_shot_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", scheduled_at="2026-09-27")

    response = await pay(client, auth_headers, lead_id, received_amount="15000")

    assert response.status_code == 200, response.text
    installment = response.json()["installments"][0]
    assert installment["paid"] is True
    assert installment["paid_at"] is not None


async def test_a_part_payment_is_enough_for_financial_approval(client, auth_headers, uploads):
    """Financial Approval asks whether money has landed, not whether it's all in."""
    lead_id = await single_shot_lead(client, auth_headers)
    await pay(client, auth_headers, lead_id, received_amount="10000", scheduled_at="2026-09-27")
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})

    response = await client.put(
        f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "financial_approval"}
    )

    assert response.status_code == 200, response.text
