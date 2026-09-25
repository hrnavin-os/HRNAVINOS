"""Changing a lead's course from the Foundation board moves its fees with it.

The Course column is the program's name, but the payment plan is priced off
program_interest - these pin that a course change re-points the program and
reprices the plan, without touching money already received.
"""
import uuid
from decimal import Decimal

from app.models.lead import Lead


async def make_planned_lead(client, auth_headers, *, program: str, plan: str) -> str:
    # The catalog read seeds the programs collection, which the create validates against.
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)
    created = await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Sha Prasanna", "phone": "7395818457", "program_interest": program, "payment_plan": plan},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def change_course(client, auth_headers, lead_id: str, course: str):
    return await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"course_interest": course})


async def test_changing_the_course_reprices_the_plan(client, auth_headers):
    lead_id = await make_planned_lead(client, auth_headers, program="recruitment_generalist", plan="two_shot")

    response = await change_course(client, auth_headers, lead_id, "Only Recruitment")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["course_interest"] == "Only Recruitment"
    assert body["program_interest"] == "only_recruitment"
    assert body["payment_plan"] == "two_shot"
    assert [Decimal(str(i["amount"])) for i in body["installments"]] == [Decimal("5000"), Decimal("5000")]
    assert "₹10,000" in body["payment_expected"]


async def test_a_paid_installment_keeps_what_was_received(client, auth_headers):
    lead_id = await make_planned_lead(client, auth_headers, program="recruitment_generalist", plan="two_shot")
    lead = await Lead.get(uuid.UUID(lead_id))
    lead.installments[0].paid = True
    lead.installments[0].transaction_id = "TXN-1"
    await lead.save()

    response = await change_course(client, auth_headers, lead_id, "Only Recruitment")

    assert response.status_code == 200, response.text
    first, second = response.json()["installments"]
    assert Decimal(str(first["amount"])) == Decimal("7500")
    assert first["paid"] is True and first["transaction_id"] == "TXN-1"
    assert Decimal(str(second["amount"])) == Decimal("5000")


async def test_a_course_that_is_not_a_program_leaves_the_fees_alone(client, auth_headers):
    lead_id = await make_planned_lead(client, auth_headers, program="recruitment_generalist", plan="single_shot")

    response = await change_course(client, auth_headers, lead_id, "Data Science")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["course_interest"] == "Data Science"
    assert body["program_interest"] == "recruitment_generalist"
    assert [Decimal(str(i["amount"])) for i in body["installments"]] == [Decimal("15000")]
