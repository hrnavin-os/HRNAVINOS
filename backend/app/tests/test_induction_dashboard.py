"""The five decision boards behind the analytics dashboard.

The pipelines are the whole feature here - every number on the screen is one
$group away from being quietly wrong - so these pin the arithmetic rather than
the plumbing: that the boards partition the same population, that the slicers
narrow all of them together, and that a stage counts what its label claims.
"""
INDUCTION_URL = "/api/v1/public/induction-form/submit"
FOUNDATION_URL = "/api/v1/public/foundation-form/submit"
DASHBOARD_URL = "/api/v1/induction-entries/analytics/dashboard"


def induction_payload(**overrides) -> dict:
    return {
        "name": "Arun",
        "phone": "9876543210",
        "registration_date": "2026-08-04",
        "sales_person": "Priya",
        "lead_source": "Instagram",
        "category": "Fresher",
        **overrides,
    }


def foundation_payload(**overrides) -> dict:
    return {
        "name": "Arun Kumar",
        "mobile_number": "9876543210",
        "email": "arun@example.com",
        "program_interest": "only_recruitment",
        "payment_timeline": "immediate",
        "queries": "None",
        **overrides,
    }


async def seed_programs(client) -> None:
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200


async def entries(client, auth_headers) -> list[dict]:
    response = await client.get("/api/v1/induction-entries?page_size=100", headers=auth_headers)
    return response.json()["items"]


async def set_remark(client, auth_headers, entry_id, remark) -> None:
    await client.put(
        f"/api/v1/induction-entries/{entry_id}", headers=auth_headers, json={"call_remark": remark}
    )


async def dashboard(client, auth_headers, query: str = "") -> dict:
    response = await client.get(f"{DASHBOARD_URL}?{query}", headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_the_boards_all_count_the_same_population(client, auth_headers):
    """Five boards on one screen describing different totals is the failure
    that makes a dashboard untrustworthy rather than merely wrong."""
    await seed_programs(client)
    for index, name in enumerate(["Arun", "Bala", "Chitra"]):
        await client.post(INDUCTION_URL, json=induction_payload(name=name, phone=f"90000000{index:02d}"))

    data = await dashboard(client, auth_headers)

    assert data["total"] == 3
    assert data["funnel"]["registered"] == 3
    assert sum(row["count"] for row in data["channels"]["lead_source"]) == 3
    assert sum(row["count"] for row in data["team"]["sales_person"]) == 3
    assert sum(row["count"] for row in data["calls"]["remarks"]) == 3
    assert sum(point["registered"] for point in data["trend"]["points"]) == 3


async def test_the_funnel_counts_what_its_labels_claim(client, auth_headers):
    """Registered, called, written up, moved - four different facts, and a
    stage that counted a different one would still look plausible on screen."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(name="Called"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Untouched", phone="9000000001"))
    rows = await entries(client, auth_headers)
    called = next(row for row in rows if row["name"] == "Called")
    await set_remark(client, auth_headers, called["id"], "Induction Call Completed - Phone Call")
    await client.put(
        f"/api/v1/induction-entries/{called['id']}/details",
        headers=auth_headers,
        json={"qualification": {"ug_degree": "B.Sc"}},
    )

    funnel = (await dashboard(client, auth_headers))["funnel"]

    assert funnel["registered"] == 2
    assert funnel["called"] == 1
    # The post-call form counts as filled the moment any one of its four pages
    # has an answer, the same rule the board's Update button reads.
    assert funnel["detailed"] == 1
    assert funnel["moved"] == 0
    assert [stage["count"] for stage in funnel["stages"]] == [2, 1, 1, 0]
    assert funnel["stages"][1]["share"] == 50.0


async def test_the_three_outcomes_partition_everyone(client, auth_headers):
    """Moved, quit and still-in-progress are drawn as one ring: nobody may be
    counted twice and nobody may be missing."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(name="Arun"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Bala", phone="9000000001"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Chitra", phone="9000000002"))
    await client.post(FOUNDATION_URL, json=foundation_payload())
    rows = await entries(client, auth_headers)
    bala = next(row for row in rows if row["name"] == "Bala")
    await set_remark(client, auth_headers, bala["id"], "Quit - Before Induction Call")

    funnel = (await dashboard(client, auth_headers))["funnel"]

    assert funnel["moved"] == 1
    assert funnel["quit"] == 1
    assert funnel["in_progress"] == 1
    assert funnel["moved"] + funnel["quit"] + funnel["in_progress"] == funnel["registered"]


async def test_the_calls_board_names_the_uncalled_and_ages_them(client, auth_headers):
    """An entry nobody has touched has no remark to appear under, so the
    remark breakdown alone can never show the backlog - which is the one thing
    this board exists to surface."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(name="Called"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Waiting", phone="9000000001"))
    rows = await entries(client, auth_headers)
    called = next(row for row in rows if row["name"] == "Called")
    await set_remark(client, auth_headers, called["id"], "Didn't Pick Up - Attempt 1")

    calls = (await dashboard(client, auth_headers))["calls"]

    assert calls["uncalled"] == 1
    # Every bucket is present, empty ones included: a missing bucket reads as
    # one that cannot happen rather than one nothing is in.
    assert [row["bucket"] for row in calls["waiting"]] == ["0-3 days", "4-7 days", "8-14 days", "15+ days"]
    assert sum(row["count"] for row in calls["waiting"]) == 1
    remarks = {row["value"]: row["count"] for row in calls["remarks"]}
    assert remarks["Didn't Pick Up - Attempt 1"] == 1
    assert remarks["Not set"] == 1


async def test_the_team_board_keeps_the_two_people_apart(client, auth_headers):
    """The sales person is who the form credits; the assignee is who the
    round-robin gave the entry to. A name can appear in both with completely
    different numbers."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(sales_person="Priya"))
    await client.post(INDUCTION_URL, json=induction_payload(phone="9000000001", sales_person="Vikram"))

    team = (await dashboard(client, auth_headers))["team"]

    assert {row["value"]: row["count"] for row in team["sales_person"]} == {"Priya": 1, "Vikram": 1}
    # Nobody is a Section Admin in this fixture, so nothing was assigned - and
    # that is reported as a named row rather than an absent board.
    assert [row["value"] for row in team["assignee"]] == ["Unassigned"]
    assert team["assignee"][0]["count"] == 2


async def test_the_slicers_narrow_every_board_together(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(name="March", registration_date="2026-03-10"))
    await client.post(
        INDUCTION_URL,
        json=induction_payload(name="August", phone="9000000001", registration_date="2026-08-04"),
    )

    windowed = await dashboard(client, auth_headers, "date_from=2026-08-01&date_to=2026-08-31")

    assert windowed["total"] == 1
    assert windowed["funnel"]["registered"] == 1
    assert sum(row["count"] for row in windowed["channels"]["category"]) == 1
    assert [row["batch"] for row in windowed["trend"]["batches"]] == ["Batch-28"]


async def test_the_trend_buckets_follow_the_window(client, auth_headers):
    """A fortnight in months is one bar and two years in days is a thousand,
    so the bucket size is chosen from the window rather than fixed."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(registration_date="2026-08-04"))

    daily = await dashboard(client, auth_headers, "date_from=2026-08-01&date_to=2026-08-31")
    yearly = await dashboard(client, auth_headers, "date_from=2024-01-01&date_to=2026-12-31")

    assert daily["trend"]["granularity"] == "day"
    assert yearly["trend"]["granularity"] == "month"


async def test_a_quiet_period_is_a_zero_not_a_missing_point(client, auth_headers):
    """Without the gap fill the line is drawn straight from the day before a
    quiet stretch to the day after it, which reads as steady traffic across
    days that had none."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(registration_date="2026-08-01"))
    await client.post(
        INDUCTION_URL, json=induction_payload(phone="9000000001", registration_date="2026-08-05")
    )

    trend = (await dashboard(client, auth_headers, "date_from=2026-08-01&date_to=2026-08-10"))["trend"]

    assert trend["granularity"] == "day"
    assert [point["period"] for point in trend["points"]] == [
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
    ]
    assert [point["registered"] for point in trend["points"]] == [1, 0, 0, 0, 1]
