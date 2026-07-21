"""Permission document — a single grantable capability, e.g. `students.create`."""
from pymongo import IndexModel
from pydantic import Field

from app.database.base import BaseDocument


class Permission(BaseDocument):
    """Code convention: `<module>.<action>`."""

    code: str = Field(max_length=100)
    module: str = Field(max_length=100)
    action: str = Field(max_length=50)
    description: str | None = Field(default=None, max_length=255)

    class Settings:
        name = "permissions"
        indexes = [
            IndexModel([("code", 1)], unique=True),
            IndexModel([("module", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Permission {self.code}>"
