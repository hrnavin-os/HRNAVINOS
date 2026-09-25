"""The Super Admin dashboard reads the real funnel: Induction, Foundation
stages and the money collected - not the unused Students/Tutors modules."""
from datetime import date

import pytest

from app.models.induction_entry import InductionEntry

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16
URL = "/api/v1/dashboard/insights"


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    from app.config.settings import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


async def lead(client, auth_headers, name: str, phone: str, **extra) -> str:
    created = await client.post("/api/v1/leads", headers=auth_headers, json={"name": name, "phone": phone, **extra})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def test_insights_on_an_empty_institute(client, auth_headers):
    response = await client.get(URL, headers=auth_headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kpis"]["foundation"]["total"] == 0
    assert [row["status"] for row in body["pipeline"]] == [
        "new_lead", "rnr", "pre_screening", "financial_approval", "batch_confirmation", "lost",
    ]
    # Every day of the window, including the quiet ones.
    assert len(body["trend"]) == 30


async def test_insights_count_the_funnel_and_the_money(client, auth_headers, uploads):
    await client.get("/api/v1/leads/course-catalog", headers=auth_headers)  # seeds programs
    paying = await lead(
        client, auth_headers, "Sha Prasanna", "7395818457",
        program_interest="recruitment_internship", payment_plan="single_shot",
    )
    quitter = await lead(client, auth_headers, "Mathuri", "8838177018", course_interest="HR Recruitment")
    await client.put(f"/api/v1/leads/{quitter}", headers=auth_headers, json={"status": "lost", "lost_reason": "Joined elsewhere"})
    # ₹10,000 of a ₹15,000 fee, the rest promised for a date already past.
    await client.post(
        f"/api/v1/leads/{paying}/installments/0",
        headers=auth_headers,
        data={"mode": "upi", "received_amount": "10000", "scheduled_at": "2020-01-01"},
        files=[("files", ("proof.png", PNG, "image/png"))],
    )
    await InductionEntry(name="Nandhini", phone="5588558855", registration_date=date.today()).insert()

    body = (await client.get(URL, headers=auth_headers)).json()

    kpis = body["kpis"]
    assert kpis["foundation"]["total"] == 2
    assert kpis["foundation"]["this_month"] == 2
    assert kpis["induction"]["total"] == 1
    assert kpis["quit"] == 1
    assert float(kpis["collected"]) == 10000
    # Only the lead still in play owes anything.
    assert float(kpis["outstanding"]) == 5000
    assert kpis["overdue_count"] == 1
    assert float(kpis["overdue_amount"]) == 5000
    due = body["upcoming_dues"][0]
    assert due["name"] == "Sha Prasanna" and due["overdue"] is True and float(due["amount"]) == 5000
    stages = {row["status"]: row["count"] for row in body["pipeline"]}
    assert stages["new_lead"] == 1 and stages["lost"] == 1
    assert body["recent_leads"][0]["name"] in {"Sha Prasanna", "Mathuri"}
    assert {row["course"] for row in body["top_courses"]} == {"Recruitment + Internship", "HR Recruitment"}
