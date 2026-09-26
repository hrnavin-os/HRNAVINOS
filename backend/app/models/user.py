"""User document — every human actor in the ERP (staff and students alike)."""
import uuid
from datetime import datetime

from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument
from app.models.staff_profile import (
    AddressDetails,
    BankDetails,
    EmploymentDetails,
    IdentityDetails,
    PersonalDetails,
)

EMAIL_INDEX_NAME = "email_1"


class User(BaseDocument):
    """A user account. Business-role-specific data (Student, Tutor, ...) lives in
    dedicated profile documents that link back to this via `user_id`."""

    # The login. Both are None for a member of staff who is on the books but
    # does not sign in - the Users form only insists on name, mobile, role and
    # department. Without an email there is nothing to sign in with, so such a
    # user can never authenticate.
    email: str | None = Field(default=None, max_length=255)
    password_hash: str | None = Field(default=None, max_length=255)
    first_name: str = Field(max_length=100)
    last_name: str = Field(default="", max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    avatar_url: str | None = Field(default=None, max_length=500)

    role_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None

    # The staff profile - see app/models/staff_profile.py.
    personal: PersonalDetails = Field(default_factory=PersonalDetails)
    employment: EmploymentDetails = Field(default_factory=EmploymentDetails)
    identity: IdentityDetails = Field(default_factory=IdentityDetails)
    address: AddressDetails = Field(default_factory=AddressDetails)
    bank: BankDetails = Field(default_factory=BankDetails)

    is_active: bool = True
    is_verified: bool = False
    must_change_password: bool = False
    last_login_at: datetime | None = None

    class Settings:
        name = "users"
        indexes = [
            # Unique among the users who have an email at all. Partial rather
            # than plain unique: a plain unique index counts a missing email as
            # a value, so a second member of staff without a login would
            # collide with the first. connect_to_mongo drops the old plain
            # index of the same name before this one is built.
            IndexModel(
                [("email", 1)],
                name=EMAIL_INDEX_NAME,
                unique=True,
                partialFilterExpression={"email": {"$type": "string"}},
            ),
            IndexModel([("role_id", 1)]),
            IndexModel([("department_id", 1)]),
            IndexModel([("is_deleted", 1)]),
        ]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def can_sign_in(self) -> bool:
        return bool(self.email and self.password_hash)

    def __repr__(self) -> str:
        return f"<User {self.email or self.full_name}>"
