"""Tests for Employee > Staffs, Departments and the Users form's staff profile."""
from app.tests.staff_helpers import department_id, role_id, staff_fields

USERS = "/api/v1/users"
DEPARTMENTS = "/api/v1/departments"
STAFFS = "/api/v1/staffs"


async def _staff(client, headers, **overrides) -> dict:
    payload = {
        "first_name": "Priya",
        "role_id": await role_id(client, headers, "Tutor"),
        **(await staff_fields(client, headers)),
        **overrides,
    }
    response = await client.post(USERS, headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------
# What the Users form insists on
# --------------------------------------------------------------------------


async def test_name_mobile_role_and_department_are_all_it_takes(client, auth_headers):
    """No email, no password, no surname: a member of staff who never signs in
    is still somebody the institute employs."""
    user = await _staff(client, auth_headers)

    assert user["email"] is None
    assert user["can_sign_in"] is False
    assert user["department"]["name"] == "General"
    assert user["role"]["name"] == "Tutor"


async def test_two_staff_without_a_login_do_not_collide(client, auth_headers):
    """The email index is unique among the emails that exist - a plain unique
    index would count two missing emails as the same one."""
    await _staff(client, auth_headers, first_name="One", phone="9000000001")
    await _staff(client, auth_headers, first_name="Two", phone="9000000002")


async def test_each_mandatory_field_is_refused_when_missing(client, auth_headers):
    complete = {
        "first_name": "Priya",
        "role_id": await role_id(client, auth_headers, "Tutor"),
        **(await staff_fields(client, auth_headers)),
    }
    for field in ("first_name", "phone", "role_id", "department_id"):
        payload = {key: value for key, value in complete.items() if key != field}
        response = await client.post(USERS, headers=auth_headers, json=payload)
        assert response.status_code == 422, (field, response.text)

    blank_phone = await client.post(USERS, headers=auth_headers, json={**complete, "phone": ""})
    assert blank_phone.status_code == 422


async def test_an_email_without_a_password_is_refused(client, auth_headers):
    """Either alone is a login nobody can use."""
    payload = {
        "first_name": "Half",
        "role_id": await role_id(client, auth_headers, "Tutor"),
        "email": "half@hrnavinos.com",
        **(await staff_fields(client, auth_headers)),
    }
    assert (await client.post(USERS, headers=auth_headers, json=payload)).status_code == 422


async def test_a_staff_member_with_a_login_can_sign_in(client, auth_headers):
    await _staff(client, auth_headers, email="Signs.In@hrnavinos.com", password="SignsIn123")
    login = await client.post("/api/v1/auth/login", json={"email": "signs.in@hrnavinos.com", "password": "SignsIn123"})
    assert login.status_code == 200, login.text


async def test_an_inactive_department_is_not_offered_to_new_staff(client, auth_headers):
    created = await client.post(DEPARTMENTS, headers=auth_headers, json={"name": "Retired", "is_active": False})
    payload = {
        "first_name": "Late",
        "role_id": await role_id(client, auth_headers, "Tutor"),
        "phone": "9876543210",
        "department_id": created.json()["id"],
    }
    assert (await client.post(USERS, headers=auth_headers, json=payload)).status_code == 400


# --------------------------------------------------------------------------
# The profile sections
# --------------------------------------------------------------------------


async def test_every_section_is_saved_and_read_back(client, auth_headers):
    user = await _staff(
        client,
        auth_headers,
        personal={"gender": "Female", "date_of_birth": "1995-04-12", "blood_group": "O+"},
        employment={"employee_code": "EMP-001", "designation": "Trainer", "date_of_joining": "2026-01-05"},
        identity={
            "aadhaar_number": "1234 5678 9012",
            "pan_number": "ABCDE1234F",
            "documents": [{"label": "Aadhaar", "url": "/uploads/staff/a.pdf", "file_name": "aadhaar.pdf"}],
        },
        address={"current": {"line1": "12 Main Rd", "city": "Chennai", "pincode": "600001"}, "permanent_same_as_current": True},
        bank={"account_number": "001122334455", "ifsc_code": "HDFC0001234"},
    )

    fetched = (await client.get(f"{USERS}/{user['id']}", headers=auth_headers)).json()
    assert fetched["personal"]["date_of_birth"] == "1995-04-12"
    assert fetched["employment"]["employee_code"] == "EMP-001"
    assert fetched["identity"]["documents"][0]["label"] == "Aadhaar"
    assert fetched["bank"]["ifsc_code"] == "HDFC0001234"
    # Ticking "same as current" writes the address down twice, so nothing
    # reading the record has to know about the flag.
    assert fetched["address"]["permanent"]["city"] == "Chennai"


async def test_editing_a_section_leaves_the_others_alone(client, auth_headers):
    user = await _staff(client, auth_headers, bank={"account_number": "999"})
    updated = await client.put(
        f"{USERS}/{user['id']}", headers=auth_headers, json={"employment": {"designation": "Lead Trainer"}}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["employment"]["designation"] == "Lead Trainer"
    assert updated.json()["bank"]["account_number"] == "999"


async def test_an_edit_cannot_clear_a_mandatory_field(client, auth_headers):
    user = await _staff(client, auth_headers)
    for field in ("phone", "department_id", "role_id"):
        response = await client.put(f"{USERS}/{user['id']}", headers=auth_headers, json={field: None})
        assert response.status_code == 422, (field, response.text)


async def test_a_login_can_be_given_later_but_not_changed(client, auth_headers):
    user = await _staff(client, auth_headers)
    given = await client.put(
        f"{USERS}/{user['id']}",
        headers=auth_headers,
        json={"email": "later@hrnavinos.com", "password": "LaterPass123"},
    )
    assert given.status_code == 200, given.text
    assert given.json()["can_sign_in"] is True

    changed = await client.put(
        f"{USERS}/{user['id']}", headers=auth_headers, json={"email": "elsewhere@hrnavinos.com"}
    )
    assert changed.status_code == 400

    reset = await client.put(f"{USERS}/{user['id']}", headers=auth_headers, json={"password": "Takeover123"})
    assert reset.status_code == 400


# --------------------------------------------------------------------------
# Departments
# --------------------------------------------------------------------------


async def test_department_names_are_unique_among_live_ones(client, auth_headers):
    assert (await client.post(DEPARTMENTS, headers=auth_headers, json={"name": "Finance"})).status_code == 201
    assert (await client.post(DEPARTMENTS, headers=auth_headers, json={"name": "finance"})).status_code == 409


async def test_a_department_with_staff_in_it_cannot_be_deleted(client, auth_headers):
    await _staff(client, auth_headers)
    general = await department_id(client, auth_headers)

    listed = (await client.get(DEPARTMENTS, headers=auth_headers)).json()["items"]
    assert next(row for row in listed if row["id"] == general)["staff_count"] == 1

    assert (await client.delete(f"{DEPARTMENTS}/{general}", headers=auth_headers)).status_code == 400

    empty = (await client.post(DEPARTMENTS, headers=auth_headers, json={"name": "Empty"})).json()
    assert (await client.delete(f"{DEPARTMENTS}/{empty['id']}", headers=auth_headers)).status_code == 200


# --------------------------------------------------------------------------
# The Staffs directory, and who may read what
# --------------------------------------------------------------------------


async def test_the_directory_filters_by_department(client, auth_headers):
    await _staff(client, auth_headers, first_name="Generalist")
    training = (await client.post(DEPARTMENTS, headers=auth_headers, json={"name": "Training"})).json()["id"]
    await _staff(client, auth_headers, first_name="Trainer", department_id=training)

    rows = (await client.get(STAFFS, headers=auth_headers, params={"department_id": training})).json()["items"]
    assert [row["first_name"] for row in rows] == ["Trainer"]


async def _login_as(client, auth_headers, role_name: str, email: str) -> dict:
    await _staff(client, auth_headers, email=email, password="ReadOnly123", role_id=await role_id(client, auth_headers, role_name))
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "ReadOnly123"})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_the_login_list_does_not_hand_out_bank_and_id_details(client, auth_headers):
    """Sales Head can read the Users list, which is who has an account - not
    everybody's bank account and Aadhaar number."""
    target = await _staff(client, auth_headers, bank={"account_number": "123456"}, identity={"pan_number": "ABCDE1234F"})
    sales = await _login_as(client, auth_headers, "Sales Head", "sales.head@hrnavinos.com")

    read = await client.get(f"{USERS}/{target['id']}", headers=sales)
    assert read.status_code == 200, read.text
    assert read.json()["bank"]["account_number"] is None
    assert read.json()["identity"]["pan_number"] is None

    assert (await client.get(STAFFS, headers=sales)).status_code == 403


async def test_a_new_staff_or_department_menu_is_granted_to_whoever_adds_users(client, auth_headers):
    """The one-shot boot migration: a role that could add users gets the two
    new menus it now needs, and nobody else does."""
    from app.database.backfills import backfill_navigation_permissions
    from app.models.permission import Permission
    from app.models.role import Role

    codes = {p.code: p.id for p in await Permission.find({}).to_list()}
    hr = await Role(name="HR Desk", permission_ids=[codes["users.view"], codes["users.create"]]).insert()
    viewer = await Role(name="Viewer", permission_ids=[codes["users.view"]]).insert()

    await backfill_navigation_permissions({"staffs.view", "departments.view"})

    hr = await Role.get(hr.id)
    viewer = await Role.get(viewer.id)
    assert {codes["staffs.view"], codes["departments.view"]} <= set(hr.permission_ids)
    assert codes["staffs.view"] not in viewer.permission_ids
