"""Tests for the Foundation board's Batch filter: it finds a lead under the
batch the Batch column shows - the Induction form's batch when there is one,
else the batch typed on the lead."""

INDUCTION_URL = "/api/v1/public/induction-form/submit"
FOUNDATION_URL = "/api/v1/public/foundation-form/submit"
LEADS_URL = "/api/v1/leads"


async def seed_programs(client) -> None:
    assert (await client.get("/api/v1/public/foundation-form/pricing")).status_code == 200


async def induction_lead(client, *, name: str, phone: str, batch: str) -> None:
    """A lead that came through Induction, so its batch is the form's."""
    response = await client.post(
        INDUCTION_URL,
        json={
            "name": name, "phone": phone, "registration_date": "2026-08-04",
            "sales_person": "Priya", "lead_source": "Meta-1", "batch": batch,
        },
    )
    assert response.status_code in (200, 201), response.text
    response = await client.post(
        FOUNDATION_URL,
        json={
            "name": name, "mobile_number": phone, "email": f"{phone}@example.com",
            "program_interest": "only_recruitment", "payment_timeline": "immediate", "queries": "None",
        },
    )
    assert response.status_code in (200, 201), response.text


async def typed_lead(client, auth_headers, *, name: str, phone: str, batch: str) -> None:
    response = await client.post(
        LEADS_URL, headers=auth_headers, json={"name": name, "phone": phone, "batch_number": batch}
    )
    assert response.status_code == 201, response.text


async def names(client, auth_headers, batch: str) -> list[str]:
    response = await client.get(LEADS_URL, headers=auth_headers, params={"batch": batch})
    assert response.status_code == 200, response.text
    return sorted(item["name"] for item in response.json()["items"])


async def seed(client, auth_headers) -> None:
    await seed_programs(client)
    await induction_lead(client, name="Meera", phone="9000000001", batch="30")
    await typed_lead(client, auth_headers, name="Ravi", phone="9000000002", batch="30")
    await typed_lead(client, auth_headers, name="Kavya", phone="9000000003", batch="Batch-29")
    await typed_lead(client, auth_headers, name="Praveen", phone="9000000004", batch="Batch 29B")
    await typed_lead(client, auth_headers, name="Nobody", phone="9000000005", batch="")


async def test_batch_filter_matches_induction_and_typed_batches(client, auth_headers):
    await seed(client, auth_headers)

    assert await names(client, auth_headers, "Batch-30") == ["Meera", "Ravi"]
    assert await names(client, auth_headers, "29") == ["Kavya"]
    # A typed batch that isn't a number is matched as written, not as 29.
    assert await names(client, auth_headers, "Batch 29B") == ["Praveen"]


async def test_the_induction_batch_wins_over_a_typed_one(client, auth_headers):
    """The column shows the induction batch whatever was typed on the lead, so
    the filter finds it there and not under the typed number."""
    await seed(client, auth_headers)
    leads = (await client.get(LEADS_URL, headers=auth_headers, params={"search": "Meera"})).json()["items"]
    await client.put(f"{LEADS_URL}/{leads[0]['id']}", headers=auth_headers, json={"batch_number": "29"})

    assert await names(client, auth_headers, "Batch-30") == ["Meera", "Ravi"]
    assert await names(client, auth_headers, "Batch-29") == ["Kavya"]


async def test_batch_filter_moves_the_cards_and_combines_with_search(client, auth_headers):
    await seed(client, auth_headers)

    stats = (await client.get(f"{LEADS_URL}/stats", headers=auth_headers, params={"batch": "Batch-30"})).json()
    assert stats["total"] == 2
    counts = (
        await client.get(f"{LEADS_URL}/whatsapp-counts", headers=auth_headers, params={"batch": "Batch-30"})
    ).json()
    assert counts["added"] + counts["not_added"] == 2

    searched = await client.get(LEADS_URL, headers=auth_headers, params={"batch": "Batch-30", "search": "Ravi"})
    assert [item["name"] for item in searched.json()["items"]] == ["Ravi"]


async def test_batch_options_name_batches_as_the_column_does(client, auth_headers):
    await seed(client, auth_headers)

    response = await client.get(f"{LEADS_URL}/batch-options", headers=auth_headers)
    assert response.status_code == 200
    # Newest batch first; a typed non-number after the numbers; no empty option.
    assert response.json() == ["Batch-30", "Batch-29", "Batch 29B"]
