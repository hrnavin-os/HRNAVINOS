"""What every POST /users now has to carry besides the login.

A user must have a mobile number, a role and a department (UserCreate). Tests
that create users for some other purpose - a Section Admin to log in as, a
tutor to allocate - spread `await staff_fields(...)` into their payload rather
than each inventing a department of their own.
"""

DEFAULT_DEPARTMENT = "General"


async def department_id(client, headers, name: str = DEFAULT_DEPARTMENT) -> str:
    """The id of a live department called `name`, created on first use."""
    listed = await client.get("/api/v1/departments", headers=headers, params={"search": name, "page_size": 100})
    assert listed.status_code == 200, listed.text
    for row in listed.json()["items"]:
        if row["name"] == name:
            return row["id"]
    created = await client.post("/api/v1/departments", headers=headers, json={"name": name})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def role_id(client, headers, name: str) -> str:
    roles = (await client.get("/api/v1/roles", headers=headers, params={"page_size": 100})).json()["items"]
    return next(role["id"] for role in roles if role["name"] == name)


async def staff_fields(client, headers, *, phone: str = "9876543210") -> dict:
    """The mandatory non-login fields, bar the role - callers pick that."""
    return {"phone": phone, "department_id": await department_id(client, headers)}
