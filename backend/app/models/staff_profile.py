"""The staff details a User carries beyond their login: the five sections of
the Users form (Personal, Employment, ID & Docs, Address, Bank).

Embedded on the User document rather than kept in a profile collection of
their own. Every User in this ERP is a member of staff - students have Student
records and no login - so there is no user a staff profile would be missing
from, and the Staffs directory can filter and search on these fields without a
second query per row.

Every field is optional. What the form insists on - name, mobile, role and
department - lives on User itself and is enforced by UserCreate.
"""
from datetime import date

from pydantic import BaseModel, Field


class PersonalDetails(BaseModel):
    gender: str | None = Field(default=None, max_length=20)
    date_of_birth: date | None = None
    blood_group: str | None = Field(default=None, max_length=10)
    marital_status: str | None = Field(default=None, max_length=20)
    father_or_spouse_name: str | None = Field(default=None, max_length=150)
    alternate_phone: str | None = Field(default=None, max_length=20)
    personal_email: str | None = Field(default=None, max_length=255)
    emergency_contact_name: str | None = Field(default=None, max_length=150)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)


class EmploymentDetails(BaseModel):
    employee_code: str | None = Field(default=None, max_length=50)
    designation: str | None = Field(default=None, max_length=100)
    # Full-time, Part-time, Contract, Intern - free text so an institute can
    # say what it actually has.
    employment_type: str | None = Field(default=None, max_length=50)
    date_of_joining: date | None = None
    work_location: str | None = Field(default=None, max_length=150)
    reporting_to: str | None = Field(default=None, max_length=150)
    monthly_salary: float | None = Field(default=None, ge=0)


class StaffDocument(BaseModel):
    """One uploaded file: an ID copy, a certificate, a resume."""

    label: str = Field(max_length=100)
    url: str = Field(max_length=500)
    file_name: str | None = Field(default=None, max_length=255)


class IdentityDetails(BaseModel):
    aadhaar_number: str | None = Field(default=None, max_length=20)
    pan_number: str | None = Field(default=None, max_length=20)
    passport_number: str | None = Field(default=None, max_length=20)
    driving_license_number: str | None = Field(default=None, max_length=30)
    uan_number: str | None = Field(default=None, max_length=20)
    esi_number: str | None = Field(default=None, max_length=20)
    documents: list[StaffDocument] = Field(default_factory=list)


class PostalAddress(BaseModel):
    line1: str | None = Field(default=None, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=10)
    country: str | None = Field(default=None, max_length=100)


class AddressDetails(BaseModel):
    current: PostalAddress = Field(default_factory=PostalAddress)
    # When set, `permanent` is a copy of `current` - kept as a flag rather than
    # only copied, so the form can show the tick again when it is reopened.
    permanent_same_as_current: bool = False
    permanent: PostalAddress = Field(default_factory=PostalAddress)


class BankDetails(BaseModel):
    account_holder_name: str | None = Field(default=None, max_length=150)
    bank_name: str | None = Field(default=None, max_length=150)
    account_number: str | None = Field(default=None, max_length=30)
    ifsc_code: str | None = Field(default=None, max_length=20)
    branch: str | None = Field(default=None, max_length=150)
    upi_id: str | None = Field(default=None, max_length=100)
