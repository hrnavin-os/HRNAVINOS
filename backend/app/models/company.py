"""Company document — a placement partner organization."""
from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class Company(BaseDocument):
    name: str = Field(max_length=150)
    industry: str | None = Field(default=None, max_length=100)
    contact_person: str | None = Field(default=None, max_length=150)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    is_active: bool = True

    class Settings:
        name = "companies"
        indexes = [IndexModel([("name", 1)], unique=True)]

    def __repr__(self) -> str:
        return f"<Company {self.name}>"
