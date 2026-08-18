"""Tests for linking an Induction Call Form entry to the Foundation Form
submission the same person makes later, keyed on mobile number."""
import pytest

from app.utils.phone import normalize_phone

INDUCTION_URL = "/api/v1/public/induction-form/submit"
FOUNDATION_URL = "/api/v1/public/foundation-form/submit"


def foundation_payload(**overrides) -> dict:
    """Every seeded Foundation Form field is required, so a submission has to
    carry all of them to get past validation."""
    return {
        "name": "Arun Kumar",
        "mobile_number": "9876543210",
        "email": "arun@example.com",
        "program_interest": "only_recruitment",
        "payment_timeline": "immediate",
        "queries": "None",
        **overrides,
    }


def induction_payload(**overrides) -> dict:
    return {
        "name": "Arun",
        "phone": "9876543210",
        "registration_date": "2026-08-04",
        "sales_person": "Priya",
        "lead_source": "Instagram",
        **overrides,
    }


async def seed_programs(client) -> None:
    """The pricing endpoint lazily seeds the programs collection, and a
    submission is rejected unless its program_interest is a live program."""
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    ["9876543210", "+91 9876543210", "+919876543210", "98765 43210", "098765 43210", "(98765)-43210"],
)
def test_normalize_phone_collapses_formatting_and_country_code(raw):
    assert normalize_phone(raw) == "9876543210"


def test_normalize_phone_returns_none_without_digits():
    # None rather than "", so two leads with no number never match each other.
    assert normalize_phone(None) is None
    assert normalize_phone("") is None
    assert normalize_phone("n/a") is None


def test_normalize_phone_keeps_short_numbers_whole():
    # Truncating a too-short number further would make unrelated typos collide.
    assert normalize_phone("12345") == "12345"


def test_normalize_phone_distinguishes_different_numbers():
    assert normalize_phone("+919876543210") != normalize_phone("+919876543211")


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------


async def test_foundation_submission_links_to_induction_entry_on_matching_number(client, auth_headers):
    await seed_programs(client)
    assert (await client.post(INDUCTION_URL, json=induction_payload())).status_code == 201

    entries = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    entry_id = entries["items"][0]["id"]

    # Same person, differently formatted number and a fuller name.
    assert (
        await client.post(FOUNDATION_URL, json=foundation_payload(mobile_number="+91 98765 43210"))
    ).status_code == 201

    leads = (await client.get("/api/v1/leads", headers=auth_headers)).json()
    assert leads["total"] == 1
    lead = leads["items"][0]
    assert lead["induction_matched"] is True
    assert lead["induction_entry_id"] == entry_id


async def test_matched_entry_leaves_the_active_induction_board(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(INDUCTION_URL, json=induction_payload(name="Meera", phone="9000000001"))

    before = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    assert before["total"] == 2

    await client.post(FOUNDATION_URL, json=foundation_payload())

    after = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    assert after["total"] == 1
    assert [item["name"] for item in after["items"]] == ["Meera"]


async def test_induction_stats_exclude_converted_entries(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(INDUCTION_URL, json=induction_payload(name="Meera", phone="9000000001"))

    before = (await client.get("/api/v1/induction-entries/stats", headers=auth_headers)).json()
    assert before["total"] == 2

    await client.post(FOUNDATION_URL, json=foundation_payload())

    # The stat cards have to agree with the table, or the board says it holds
    # two rows while showing one.
    after = (await client.get("/api/v1/induction-entries/stats", headers=auth_headers)).json()
    assert after["total"] == 1


async def test_induction_data_survives_the_move(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    entry_id = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]["id"]

    await client.put(
        f"/api/v1/induction-entries/{entry_id}/details",
        headers=auth_headers,
        json={"qualification": {"ug_degree": "B.Sc Physics"}},
    )
    await client.post(FOUNDATION_URL, json=foundation_payload())

    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]
    linked = await client.get(f"/api/v1/leads/{lead_id}/induction", headers=auth_headers)

    assert linked.status_code == 200
    body = linked.json()
    assert body["id"] == entry_id
    assert body["name"] == "Arun"
    assert body["sales_person"] == "Priya"
    assert body["qualification"]["ug_degree"] == "B.Sc Physics"
    assert body["foundation_lead_id"] == lead_id


async def test_unmatched_number_creates_a_standalone_foundation_lead(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())

    assert (
        await client.post(FOUNDATION_URL, json=foundation_payload(name="New Lead", mobile_number="9123456789"))
    ).status_code == 201

    leads = (await client.get("/api/v1/leads", headers=auth_headers)).json()
    unmatched = next(item for item in leads["items"] if item["phone"] == "9123456789")
    assert unmatched["induction_matched"] is False
    assert unmatched["induction_entry_id"] is None

    # The induction entry it didn't match must not have been moved.
    entries = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    assert entries["total"] == 1


async def test_unmatched_lead_has_no_induction_record_to_show(client, auth_headers):
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload(mobile_number="9123456789"))
    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]

    response = await client.get(f"/api/v1/leads/{lead_id}/induction", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() is None


async def test_leads_can_be_filtered_by_induction_match(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload(name="Cold Lead", mobile_number="9123456789"))

    matched = (
        await client.get("/api/v1/leads?induction_matched=true", headers=auth_headers)
    ).json()
    unmatched = (
        await client.get("/api/v1/leads?induction_matched=false", headers=auth_headers)
    ).json()

    assert [item["name"] for item in matched["items"]] == ["Arun Kumar"]
    assert [item["name"] for item in unmatched["items"]] == ["Cold Lead"]

    stats = (await client.get("/api/v1/leads/stats", headers=auth_headers)).json()
    assert stats["by_induction_match"] == {"matched": 1, "unmatched": 1}


# --------------------------------------------------------------------------
# Duplicate prevention
# --------------------------------------------------------------------------


async def test_resubmitting_the_form_updates_the_lead_instead_of_duplicating_it(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    # A refresh, a double tap, or the student filling it in again later.
    assert (
        await client.post(FOUNDATION_URL, json=foundation_payload(name="Arun K", mobile_number="+919876543210"))
    ).status_code == 201

    leads = (await client.get("/api/v1/leads", headers=auth_headers)).json()
    assert leads["total"] == 1
    assert leads["items"][0]["name"] == "Arun K"
    # The link survives the second submission rather than being re-resolved
    # against an entry that has already been converted.
    assert leads["items"][0]["induction_matched"] is True


async def test_resubmission_does_not_reopen_a_lead_that_has_moved_on(client, auth_headers):
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload())
    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]

    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})
    await client.post(FOUNDATION_URL, json=foundation_payload())

    lead = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    assert lead["status"] == "pre_screening"


async def test_resubmission_keeps_payment_details_already_recorded(client, auth_headers):
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload(payment_plan="two_shot"))
    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]

    recorded = await client.post(
        f"/api/v1/leads/{lead_id}/installments/0",
        headers=auth_headers,
        data={"amount": "9000", "mode": "upi", "transaction_id": "TXN-1"},
    )
    assert recorded.status_code == 200
    # An installment only counts as paid once its proof is uploaded, so this is
    # the half-finished state - details captured, proof still to come - that a
    # resubmission is most likely to quietly destroy.
    assert recorded.json()["installments"][0]["paid"] is False

    await client.post(FOUNDATION_URL, json=foundation_payload(payment_plan="two_shot"))

    lead = (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()
    # Rebuilding the plan from the form would have wiped both of these.
    assert lead["installments"][0]["transaction_id"] == "TXN-1"
    assert lead["installments"][0]["mode"] == "upi"


async def test_foundation_submission_does_not_duplicate_a_hand_keyed_lead(client, auth_headers):
    await seed_programs(client)
    await client.post(
        "/api/v1/leads",
        headers=auth_headers,
        json={"name": "Arun", "phone": "+91 98765 43210", "course_interest": "Recruitment"},
    )

    await client.post(FOUNDATION_URL, json=foundation_payload())

    leads = (await client.get("/api/v1/leads", headers=auth_headers)).json()
    assert leads["total"] == 1


async def test_a_lead_created_before_its_induction_entry_links_on_resubmission(client, auth_headers):
    """The induction entry can be keyed in after the form was first submitted -
    the link is only possible on the next submission, and has to happen then."""
    await seed_programs(client)
    await client.post(FOUNDATION_URL, json=foundation_payload())
    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]
    assert (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()["induction_matched"] is False

    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    assert (await client.get(f"/api/v1/leads/{lead_id}", headers=auth_headers)).json()["induction_matched"] is True
    assert (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["total"] == 0


# --------------------------------------------------------------------------
# The two Induction tabs
# --------------------------------------------------------------------------


async def test_a_pending_entry_reports_itself_as_pending(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())

    row = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]
    assert row["status"] == "pending_induction"
    assert row["converted_at"] is None


async def test_a_matched_entry_moves_to_the_other_tab(client, auth_headers):
    """The status is derived from foundation_lead_id, which the mobile-number
    match sets - so crossing tabs needs nothing else to happen."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    pending = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    moved = (
        await client.get(
            "/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers
        )
    ).json()

    assert pending["total"] == 0
    assert moved["total"] == 1
    assert moved["items"][0]["status"] == "moved_to_foundation"
    assert moved["items"][0]["converted_at"] is not None


async def test_the_moved_tab_carries_the_foundation_stage(client, auth_headers):
    """Foundation Status on that tab is the linked lead's own pipeline stage,
    not a copy taken at the moment of the move."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    lead_id = (await client.get("/api/v1/leads", headers=auth_headers)).json()["items"][0]["id"]
    await client.put(f"/api/v1/leads/{lead_id}", headers=auth_headers, json={"status": "pre_screening"})

    moved = (
        await client.get(
            "/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers
        )
    ).json()
    assert moved["items"][0]["foundation_status"] == "pre_screening"


async def test_each_entry_is_in_exactly_one_tab(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(INDUCTION_URL, json=induction_payload(name="Meera", phone="9000000001"))
    await client.post(FOUNDATION_URL, json=foundation_payload())

    stats = (await client.get("/api/v1/induction-entries/stats", headers=auth_headers)).json()

    assert stats["by_status"] == {"pending_induction": 1, "moved_to_foundation": 1, "quit": 0}
    # The cards count the open tab, so they agree with the rows beneath them.
    assert stats["total"] == 1


async def test_stats_follow_the_open_tab(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())

    moved_stats = (
        await client.get(
            "/api/v1/induction-entries/stats?status=moved_to_foundation", headers=auth_headers
        )
    ).json()
    assert moved_stats["total"] == 1


async def test_the_call_remark_saves_and_clears(client, auth_headers):
    """Set from a dropdown on the board, so it goes through the ordinary update
    endpoint - and clearing it has to work, or a remark picked by mistake could
    never be taken off the candidate again."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    entry_id = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]["id"]

    saved = await client.put(
        f"/api/v1/induction-entries/{entry_id}",
        headers=auth_headers,
        json={"call_remark": "Induction Call Scheduled - Today"},
    )
    assert saved.status_code == 200
    assert saved.json()["call_remark"] == "Induction Call Scheduled - Today"

    cleared = await client.put(
        f"/api/v1/induction-entries/{entry_id}", headers=auth_headers, json={"call_remark": None}
    )
    assert cleared.json()["call_remark"] is None


async def test_the_call_remark_survives_the_move_to_foundation(client, auth_headers):
    """It is set on the induction record, which the move links rather than
    copies - so the Moved tab shows the remark the caller actually left."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    entry_id = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]["id"]
    await client.put(
        f"/api/v1/induction-entries/{entry_id}",
        headers=auth_headers,
        json={"call_remark": "Induction Call Completed - Phone Call"},
    )

    await client.post(FOUNDATION_URL, json=foundation_payload())

    moved = (
        await client.get("/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers)
    ).json()
    assert moved["items"][0]["call_remark"] == "Induction Call Completed - Phone Call"


async def set_remark(client, auth_headers, entry_id, remark):
    await client.put(
        f"/api/v1/induction-entries/{entry_id}", headers=auth_headers, json={"call_remark": remark}
    )


async def test_a_quit_remark_moves_the_entry_to_the_quit_bucket(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    entry_id = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]["id"]

    await set_remark(client, auth_headers, entry_id, "Quit - After Foundation Session")

    pending = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()
    quit_rows = (await client.get("/api/v1/induction-entries?status=quit", headers=auth_headers)).json()

    assert pending["total"] == 0
    assert quit_rows["total"] == 1
    assert quit_rows["items"][0]["status"] == "quit"


async def test_quit_wins_over_having_moved_to_foundation(client, auth_headers):
    """Quitting happens after the move as often as before it - DAY-3 QUIT is a
    student who was already in a batch. They belong in one bucket, and it isn't
    the one that says they are progressing."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    await client.post(FOUNDATION_URL, json=foundation_payload())
    entry_id = (
        await client.get("/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers)
    ).json()["items"][0]["id"]

    await set_remark(client, auth_headers, entry_id, "Quit - After Foundation Session")

    moved = (
        await client.get("/api/v1/induction-entries?status=moved_to_foundation", headers=auth_headers)
    ).json()
    quit_rows = (await client.get("/api/v1/induction-entries?status=quit", headers=auth_headers)).json()
    assert moved["total"] == 0
    assert quit_rows["total"] == 1


async def test_a_non_quit_remark_leaves_the_bucket_alone(client, auth_headers):
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())
    entry_id = (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["items"][0]["id"]

    await set_remark(client, auth_headers, entry_id, "Induction Call Scheduled - Tomorrow")

    assert (await client.get("/api/v1/induction-entries", headers=auth_headers)).json()["total"] == 1
    assert (await client.get("/api/v1/induction-entries?status=quit", headers=auth_headers)).json()["total"] == 0


async def test_every_quit_wording_is_recognised(client, auth_headers):
    """Classified on the word rather than a list of the exact options, so the
    backend holds no second copy of a list that lives in the frontend. This
    pins that every wording actually offered is caught by it."""
    await seed_programs(client)
    quit_remarks = [
        "Quit - Before Induction Call",
        "Quit - After Induction Call (Foundation Session Not Attended)",
        "Quit - After Foundation Session",
    ]
    for index, remark in enumerate(quit_remarks):
        await client.post(INDUCTION_URL, json=induction_payload(name=remark, phone=f"90000000{index:02d}"))

    entries = (await client.get("/api/v1/induction-entries?page_size=100", headers=auth_headers)).json()
    for row in entries["items"]:
        await set_remark(client, auth_headers, row["id"], row["name"])

    quit_rows = (
        await client.get("/api/v1/induction-entries?status=quit&page_size=100", headers=auth_headers)
    ).json()
    assert quit_rows["total"] == len(quit_remarks)


async def test_the_three_buckets_partition_the_board(client, auth_headers):
    """They are cards on one row that read as a total - so nobody may be
    counted twice and nobody may be missing."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(name="Still here"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Crossed", phone="9000000001"))
    await client.post(INDUCTION_URL, json=induction_payload(name="Gone", phone="9000000002"))

    rows = (await client.get("/api/v1/induction-entries?page_size=100", headers=auth_headers)).json()["items"]
    gone = next(row for row in rows if row["name"] == "Gone")
    await set_remark(client, auth_headers, gone["id"], "Quit - Before Induction Call")
    await client.post(FOUNDATION_URL, json=foundation_payload(mobile_number="9000000001"))

    stats = (await client.get("/api/v1/induction-entries/stats", headers=auth_headers)).json()
    assert stats["by_status"] == {"pending_induction": 1, "moved_to_foundation": 1, "quit": 1}


# --------------------------------------------------------------------------
# Analytics dashboard
# --------------------------------------------------------------------------


async def test_category_analytics_counts_conversions_and_quits(client, auth_headers):
    """A bare count per category answers nothing useful - how many of them
    converted and how many walked is the question the board exists for."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(category="Fresher"))
    # Names are at least two characters - the form rejects a single letter, so
    # a one-character name here would silently create nothing.
    await client.post(
        INDUCTION_URL, json=induction_payload(name="Bala", phone="9000000001", category="Fresher")
    )
    await client.post(
        INDUCTION_URL, json=induction_payload(name="Chitra", phone="9000000002", category="Job Switch")
    )

    # One Fresher crosses to Foundation, the other quits.
    await client.post(FOUNDATION_URL, json=foundation_payload())
    rows = (await client.get("/api/v1/induction-entries?page_size=100", headers=auth_headers)).json()["items"]
    bala = next(r["id"] for r in rows if r["name"] == "Bala")
    await set_remark(client, auth_headers, bala, "Quit - After Foundation Session")

    data = (
        await client.get("/api/v1/induction-entries/analytics?dimension=category", headers=auth_headers)
    ).json()

    assert data["total"] == 3
    by_value = {item["value"]: item for item in data["items"]}
    assert by_value["Fresher"] == {"value": "Fresher", "count": 2, "moved": 1, "quit": 1}
    assert by_value["Job Switch"]["count"] == 1


async def test_analytics_names_the_entries_with_no_value(client, auth_headers):
    """How much of the data is missing is itself a finding, so those entries
    are a named row rather than quietly dropped."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload())

    data = (
        await client.get("/api/v1/induction-entries/analytics?dimension=call_remark", headers=auth_headers)
    ).json()

    assert data["items"] == [{"value": "Not set", "count": 1, "moved": 0, "quit": 0}]


async def test_analytics_is_sorted_biggest_first(client, auth_headers):
    await seed_programs(client)
    for index in range(3):
        await client.post(
            INDUCTION_URL,
            json=induction_payload(name=f"A{index}", phone=f"900000000{index}", category="Fresher"),
        )
    await client.post(
        INDUCTION_URL, json=induction_payload(name="Solo", phone="9111111111", category="Career Gap")
    )

    data = (
        await client.get("/api/v1/induction-entries/analytics?dimension=category", headers=auth_headers)
    ).json()

    assert [item["value"] for item in data["items"]] == ["Fresher", "Career Gap"]


@pytest.mark.parametrize(
    ("dimension", "first", "second"),
    [("sales_person", "Priya", "Vikram"), ("lead_source", "Instagram", "Referral")],
)
async def test_analytics_groups_the_forms_free_text_fields(
    client, auth_headers, dimension, first, second
):
    """Sales person and lead source have no fixed vocabulary the way category
    and call remark do, so the grouping has to come out of the data itself -
    and it still has to carry moved and quit, which is the whole point of
    breaking the intake down by who sourced it."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(**{dimension: first}))
    await client.post(
        INDUCTION_URL, json=induction_payload(name="Bala", phone="9000000001", **{dimension: first})
    )
    await client.post(
        INDUCTION_URL, json=induction_payload(name="Chitra", phone="9000000002", **{dimension: second})
    )

    # One of the pair crosses to Foundation, the other quits.
    await client.post(FOUNDATION_URL, json=foundation_payload())
    rows = (await client.get("/api/v1/induction-entries?page_size=100", headers=auth_headers)).json()["items"]
    bala = next(r["id"] for r in rows if r["name"] == "Bala")
    await set_remark(client, auth_headers, bala, "Quit - After Foundation Session")

    data = (
        await client.get(
            f"/api/v1/induction-entries/analytics?dimension={dimension}", headers=auth_headers
        )
    ).json()

    assert data["total"] == 3
    by_value = {item["value"]: item for item in data["items"]}
    assert by_value[first] == {"value": first, "count": 2, "moved": 1, "quit": 1}
    assert by_value[second]["count"] == 1


async def test_analytics_refuses_an_unknown_dimension(client, auth_headers):
    """The field is looked up in a closed map, so no caller can group the
    collection by an arbitrary field."""
    response = await client.get("/api/v1/induction-entries/analytics?dimension=phone", headers=auth_headers)
    assert response.status_code == 422


# --------------------------------------------------------------------------
# Date window and ordering
# --------------------------------------------------------------------------
LIST_URL = "/api/v1/induction-entries"


async def seed_three_months(client) -> None:
    """One entry per month, so a window can be asked for that holds exactly
    one of them - and a boundary date can be tested for inclusiveness."""
    await seed_programs(client)
    for index, (name, day) in enumerate(
        [("March", "2026-03-10"), ("April", "2026-04-02"), ("May", "2026-05-20")]
    ):
        await client.post(
            INDUCTION_URL,
            json=induction_payload(name=name, phone=f"90000001{index:02d}", registration_date=day),
        )


async def names_at(client, auth_headers, query: str) -> list[str]:
    rows = (await client.get(f"{LIST_URL}?{query}&page_size=100", headers=auth_headers)).json()
    return [row["name"] for row in rows["items"]]


async def test_the_date_filter_narrows_to_its_window(client, auth_headers):
    """Both ends inclusive: a filter that quietly drops the entries registered
    on the last day of the range is the kind of thing nobody notices until a
    month's numbers are short."""
    await seed_three_months(client)

    assert await names_at(client, auth_headers, "date_from=2026-04-01&date_to=2026-04-30") == ["April"]
    assert await names_at(client, auth_headers, "date_from=2026-04-02&date_to=2026-04-02") == ["April"]


async def test_either_end_of_the_date_filter_may_be_left_open(client, auth_headers):
    """Asking for everything since March is a real question, so one bound is
    enough - the other simply isn't applied."""
    await seed_three_months(client)

    assert sorted(await names_at(client, auth_headers, "date_from=2026-04-01")) == ["April", "May"]
    assert sorted(await names_at(client, auth_headers, "date_to=2026-04-30")) == ["April", "March"]


async def test_batch_and_the_date_filter_intersect(client, auth_headers):
    """Both narrow registration_date. Whichever the route reads second must not
    replace the other, or picking a batch would silently widen the dates back
    out to the whole month."""
    await seed_three_months(client)
    rows = (await client.get(f"{LIST_URL}?page_size=100", headers=auth_headers)).json()["items"]
    april_batch = next(row["batch"] for row in rows if row["name"] == "April")

    assert await names_at(client, auth_headers, f"batch={april_batch}") == ["April"]
    assert await names_at(client, auth_headers, f"batch={april_batch}&date_from=2026-05-01") == []


async def test_the_board_can_be_ordered_oldest_first(client, auth_headers):
    """The Newest/Oldest toggle sorts on registration date, which is what the
    board shows and what its batches are derived from."""
    await seed_three_months(client)

    assert await names_at(client, auth_headers, "sort_order=asc") == ["March", "April", "May"]
    assert await names_at(client, auth_headers, "sort_order=desc") == ["May", "April", "March"]


async def test_the_analytics_filters_narrow_the_breakdown(client, auth_headers):
    """The dashboard's filter rail is applied inside the aggregation, so every
    panel on the canvas counts the same population - a filter that only
    narrowed the table would leave the ring beside it answering for everyone."""
    await seed_programs(client)
    await client.post(
        INDUCTION_URL,
        json=induction_payload(name="March", phone="9000000210", registration_date="2026-03-10", category="Fresher"),
    )
    await client.post(
        INDUCTION_URL,
        json=induction_payload(
            name="August", phone="9000000211", registration_date="2026-08-04", category="Career Gap"
        ),
    )

    everything = (
        await client.get("/api/v1/induction-entries/analytics?dimension=category", headers=auth_headers)
    ).json()
    august = (
        await client.get(
            "/api/v1/induction-entries/analytics?dimension=category&date_from=2026-08-01&date_to=2026-08-31",
            headers=auth_headers,
        )
    ).json()

    assert everything["total"] == 2
    assert august["total"] == 1
    assert [item["value"] for item in august["items"]] == ["Career Gap"]


async def test_the_analytics_compares_against_the_previous_period(client, auth_headers):
    """The arrows on the stat tiles need a period to point away from. With a
    window set that is the window of the same length before it; the label says
    which, because an arrow with no period named is a number nobody can
    check."""
    await seed_programs(client)
    await client.post(
        INDUCTION_URL,
        json=induction_payload(name="Earlier", phone="9000000220", registration_date="2026-08-02"),
    )
    await client.post(
        INDUCTION_URL,
        json=induction_payload(name="Later A", phone="9000000221", registration_date="2026-08-12"),
    )
    await client.post(
        INDUCTION_URL,
        json=induction_payload(name="Later B", phone="9000000222", registration_date="2026-08-13"),
    )

    data = (
        await client.get(
            "/api/v1/induction-entries/analytics?dimension=category"
            "&date_from=2026-08-11&date_to=2026-08-20",
            headers=auth_headers,
        )
    ).json()

    assert data["current"]["total"] == 2
    # The ten days before the eleventh, which is where "Earlier" sits.
    assert data["comparison"]["total"] == 1
    assert data["comparison"]["label"] == "vs previous 10 days"


async def test_a_one_ended_window_has_no_period_to_compare_with(client, auth_headers):
    """"Everything since March" has no length, so there is no equal period
    before it - and inventing one would put an authoritative arrow on a
    comparison nobody asked for."""
    await seed_programs(client)
    await client.post(INDUCTION_URL, json=induction_payload(phone="9000000230"))

    data = (
        await client.get(
            "/api/v1/induction-entries/analytics?dimension=category&date_from=2026-01-01",
            headers=auth_headers,
        )
    ).json()

    assert data["comparison"] is None
    assert data["current"] is None
