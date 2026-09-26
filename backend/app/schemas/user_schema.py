"""Request/response DTOs for the User Management module."""
import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.staff_profile import (
    AddressDetails,
    BankDetails,
    EmploymentDetails,
    IdentityDetails,
    PersonalDetails,
)
from app.schemas.department_schema import DepartmentSummaryResponse
from app.schemas.role_schema import RoleSummaryResponse

_DIGITS = re.compile(r"\D")


def _check_password(value: str | None) -> str | None:
    if value is None:
        return None
    if not any(c.isupper() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain at least one uppercase letter and one digit.")
    return value


def _check_mobile(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if len(_DIGITS.sub("", value)) < 10:
        raise ValueError("Enter a valid mobile number of at least 10 digits.")
    return value


class _UserFields(BaseModel):
    """What the create and update payloads share."""

    @field_validator("email", "password", "last_name", "phone", mode="before", check_fields=False)
    @classmethod
    def blank_is_missing(cls, value):
        # An untouched optional field arrives from the form as "", which
        # EmailStr and the password rules would otherwise reject outright.
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("password", check_fields=False)
    @classmethod
    def password_strength(cls, value: str | None) -> str | None:
        return _check_password(value)

    @field_validator("phone", check_fields=False)
    @classmethod
    def mobile_number(cls, value: str | None) -> str | None:
        return _check_mobile(value)


class UserCreate(_UserFields):
    # The Users form insists on four things only: name, mobile, role and
    # department. The login is optional - a member of staff who never signs
    # in is recorded without one - but an email and a password come together
    # or not at all, since either alone is a login nobody can use.
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str = Field(max_length=20)
    role_id: uuid.UUID
    department_id: uuid.UUID
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_active: bool = True

    personal: PersonalDetails = Field(default_factory=PersonalDetails)
    employment: EmploymentDetails = Field(default_factory=EmploymentDetails)
    identity: IdentityDetails = Field(default_factory=IdentityDetails)
    address: AddressDetails = Field(default_factory=AddressDetails)
    bank: BankDetails = Field(default_factory=BankDetails)


    @model_validator(mode="after")
    def login_is_both_or_neither(self) -> "UserCreate":
        if bool(self.email) != bool(self.password):
            raise ValueError("Give both an email and a password to let this user sign in, or leave both blank.")
        return self


class UserUpdate(_UserFields):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    role_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    is_active: bool | None = None
    # Only for giving a login to somebody who has none - UserService.update
    # refuses both on a user who can already sign in. Changing an existing
    # login's email or password is not an admin edit.
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    # Each section is replaced whole when sent: the form always sends every
    # field of a section it shows, so merging would only keep stale values.
    personal: PersonalDetails | None = None
    employment: EmploymentDetails | None = None
    identity: IdentityDetails | None = None
    address: AddressDetails | None = None
    bank: BankDetails | None = None


    @model_validator(mode="after")
    def mandatory_fields_stay_set(self) -> "UserUpdate":
        # Leaving a field out of an update is fine; sending it empty is
        # clearing something every user must have.
        for name, label in (
            ("first_name", "Name"),
            ("phone", "Mobile number"),
            ("role_id", "Role"),
            ("department_id", "Department"),
        ):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{label} is required.")
        return self


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr | None
    first_name: str
    last_name: str
    phone: str | None
    is_active: bool
    is_verified: bool
    # False for a member of staff recorded without a login.
    can_sign_in: bool
    last_login_at: datetime | None
    role: RoleSummaryResponse | None
    department: DepartmentSummaryResponse | None = None
    personal: PersonalDetails
    employment: EmploymentDetails
    identity: IdentityDetails
    address: AddressDetails
    bank: BankDetails
    created_at: datetime
    updated_at: datetime
    # Only set on the Deleted tab's rows. `deleted_by_name` is resolved for
    # the page rather than left as an id, since a list of ids is not something
    # anybody can read a decision out of.
    deleted_at: datetime | None = None
    deleted_by_name: str | None = None
    deleted_reason: str | None = None

    model_config = {"from_attributes": True}


class UserDelete(BaseModel):
    """Why a user is being removed. Required - see UserService.delete."""

    reason: str = Field(min_length=3, max_length=500)


class UserListResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr | None
    first_name: str
    last_name: str
    phone: str | None = None
    can_sign_in: bool = True
    department: DepartmentSummaryResponse | None = None
    # Carried on the list row, not just the detail: the Deleted tab is a list,
    # and a reason you have to open a record to read is a reason nobody reads.
    deleted_at: datetime | None = None
    deleted_by_name: str | None = None
    deleted_reason: str | None = None
    is_active: bool
    role: RoleSummaryResponse | None

    model_config = {"from_attributes": True}


class StaffDocumentUploadResponse(BaseModel):
    url: str
    file_name: str | None
