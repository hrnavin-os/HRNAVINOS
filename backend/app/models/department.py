"""Department document - the unit of the institute a staff member works in
(Admin, Finance, Sales, Training, ...), managed from Employee > Departments.

Every staff member belongs to one (User.department_id). Names are unique among
live departments only, checked in DepartmentService rather than by a unique
index: a department deleted on purpose should not block a new one taking its
name later.
"""
from pydantic import Field
from pymongo import IndexModel

from app.database.base import BaseDocument


class Department(BaseDocument):
    name: str = Field(max_length=100)
    # A short code for reports and employee IDs ("ADM", "FIN"). Optional.
    code: str | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=500)
    # Deactivating retires a department from the user form's picker without
    # touching the staff who are already in it.
    is_active: bool = True

    class Settings:
        name = "departments"
        indexes = [
            IndexModel([("name", 1)]),
            IndexModel([("is_deleted", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Department {self.name}>"
