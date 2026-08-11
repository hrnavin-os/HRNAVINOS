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
