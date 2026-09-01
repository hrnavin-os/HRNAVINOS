"""Tests for the Terms & Conditions register.

The register lists induction entries, so every test here seeds one.
"""

INDUCTION_URL = "/api/v1/induction-entries"
STUDENTS_URL = "/api/v1/terms/students"
DOCUMENT_URL = "/api/v1/terms/document"


async def add_student(client, auth_headers, *, name: str = "Arun", phone: str = "9876543210") -> str:
    response = await client.post(
        INDUCTION_URL,
        headers=auth_headers,
        json={
            "name": name,
            "phone": phone,
            "registration_date": "2026-08-04",
            "sales_person": "Priya",
            "lead_source": "Instagram",
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def test_all_students_lists_the_induction_roll(client, auth_headers):
    await add_student(client, auth_headers, name="Arun", phone="9876543210")
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    response = await client.get(STUDENTS_URL, headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    # Nobody has signed anything yet, so the whole roll starts unsigned.
    assert all(row["signed"] is False for row in body["items"])


async def test_marking_signed_moves_a_student_between_tabs(client, auth_headers):
    entry_id = await add_student(client, auth_headers)
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    marked = await client.post(f"{STUDENTS_URL}/{entry_id}/sign", headers=auth_headers)
    assert marked.status_code == 200
    assert marked.json()["signed"] is True
    # Who vouched for the signature, not just that one exists.
    assert marked.json()["signed_by_name"]
    assert marked.json()["signed_at"]

    signed = await client.get(STUDENTS_URL, headers=auth_headers, params={"filter": "signed"})
    assert [row["id"] for row in signed.json()["items"]] == [entry_id]

    not_signed = await client.get(STUDENTS_URL, headers=auth_headers, params={"filter": "not_signed"})
    assert [row["name"] for row in not_signed.json()["items"]] == ["Divya"]


async def test_unsigning_returns_a_student_and_clears_the_attribution(client, auth_headers):
    entry_id = await add_student(client, auth_headers)
    await client.post(f"{STUDENTS_URL}/{entry_id}/sign", headers=auth_headers)

    undone = await client.delete(f"{STUDENTS_URL}/{entry_id}/sign", headers=auth_headers)
    assert undone.status_code == 200
    assert undone.json()["signed"] is False
    # A withdrawn signature has no voucher - leaving the name behind would say
    # somebody stands by a signature that no longer exists.
    assert undone.json()["signed_by_name"] is None
    assert undone.json()["signed_at"] is None

    not_signed = await client.get(STUDENTS_URL, headers=auth_headers, params={"filter": "not_signed"})
    assert not_signed.json()["total"] == 1


async def test_stats_split_the_roll_in_two(client, auth_headers):
    entry_id = await add_student(client, auth_headers)
    await add_student(client, auth_headers, name="Divya", phone="9876500000")
    await client.post(f"{STUDENTS_URL}/{entry_id}/sign", headers=auth_headers)

    stats = (await client.get(f"{STUDENTS_URL}/stats", headers=auth_headers)).json()
    assert stats == {"total": 2, "signed": 1, "not_signed": 1}


async def test_the_induction_update_form_and_the_register_write_the_same_field(client, auth_headers):
    """Page four of the update form has always carried the terms tick. The
    register reads that field rather than one of its own, so a signature
    recorded on either surface is visible on both."""
    entry_id = await add_student(client, auth_headers)

    await client.put(
        f"/api/v1/induction-entries/{entry_id}/details",
        headers=auth_headers,
        json={"other_details": {"terms_form_signed": True}},
    )

    signed = await client.get(STUDENTS_URL, headers=auth_headers, params={"filter": "signed"})
    assert [row["id"] for row in signed.json()["items"]] == [entry_id]
    # And the tick made over there is attributed here too.
    assert signed.json()["items"][0]["signed_by_name"]


async def test_search_narrows_the_register(client, auth_headers):
    await add_student(client, auth_headers, name="Arun", phone="9876543210")
    await add_student(client, auth_headers, name="Divya", phone="9876500000")

    found = await client.get(STUDENTS_URL, headers=auth_headers, params={"search": "Divya"})
    assert [row["name"] for row in found.json()["items"]] == ["Divya"]


async def test_document_is_created_empty_and_then_edited(client, auth_headers):
    first = await client.get(DOCUMENT_URL, headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["body"] == ""

    saved = await client.put(
        DOCUMENT_URL,
        headers=auth_headers,
        json={"title": "HRNAVINOS Terms", "body": "1. Attend every session.\n2. Pay on time."},
    )
    assert saved.status_code == 200
    assert saved.json()["title"] == "HRNAVINOS Terms"
    assert saved.json()["updated_by_name"]

    # Singleton: a second read returns the edit rather than a fresh blank one.
    again = await client.get(DOCUMENT_URL, headers=auth_headers)
    assert again.json()["body"].startswith("1. Attend every session.")
