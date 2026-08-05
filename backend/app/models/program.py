"""Program document — the single source of truth for the programs a student
can pick in the public Foundation Form's "Program you are planning to join?"
dropdown.

These used to be the four hardcoded members of the `ProgramInterest` enum,
mirrored into the FoundationFormConfig singleton. They now live here so an
admin can add, rename, and retire programs at runtime with no code change.

`value` is the stable identifier written to Lead.program_interest, so it is
generated once from the name at creation and never changes afterwards — the
same rule FormCollectionSectionCfg.code follows, and for the same reason:
existing leads reference it.

`category` points at a FoundationFormConfig pricing category code. Programs
are not just names — the chosen category is what decides the payment plans
and installment amounts offered on page 2 of the form, so every program must
name one.
"""
from pydantic import Field
from pymongo import IndexModel

from app.database.base import BaseDocument


class Program(BaseDocument):
    name: str = Field(max_length=255)
    value: str = Field(max_length=50)
    category: str = Field(max_length=50)
    description: str | None = Field(default=None, max_length=500)
    # Only active programs are offered in the public form. Deactivating is the
    # safe way to retire a program that leads already reference, since deleting
    # one is blocked while any lead points at it.
    is_active: bool = True
    order: int = 0

    class Settings:
        name = "programs"
        indexes = [
            IndexModel([("value", 1)], unique=True),
            IndexModel([("order", 1), ("name", 1)]),
        ]

    def __repr__(self) -> str:
        return f"<Program {self.value}>"
