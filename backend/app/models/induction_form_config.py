"""InductionFormConfig document - a singleton describing the Induction Call
Form: which questions it asks, in what order, which are required, and what each
dropdown offers.

Mirrors the FoundationFormConfig singleton (fetched via find_one({}) with no
filter, so there is exactly one). Splitting the form's shape out of the code
is what makes it editable at runtime: adding a sales person or renaming a
label becomes a save here rather than a deploy.

`key` is NOT editable - it's the field name the API expects on submit
(InductionEntryCreate), so renaming one would break the form. Only the
presentation and the option lists are open.
"""
from pydantic import BaseModel, Field

from app.database.base import BaseDocument


class InductionFormField(BaseModel):
    key: str = Field(max_length=50)
    label: str = Field(max_length=150)
    required: bool = False
    order: int = 0
    # Only meaningful for the combobox fields; empty for plain text/date ones.
    # These are suggestions, never a whitelist - the form still accepts a typed
    # value that isn't listed, so this list can be edited freely without
    # invalidating anything already submitted.
    options: list[str] = Field(default_factory=list)


class InductionFormConfig(BaseDocument):
    fields: list[InductionFormField] = Field(default_factory=list)

    class Settings:
        name = "induction_form_config"

    def __repr__(self) -> str:
        return f"<InductionFormConfig fields={len(self.fields)}>"
