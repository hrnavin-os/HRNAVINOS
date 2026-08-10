"""Request/response DTOs for the Induction Call Form config."""
from datetime import datetime

from pydantic import BaseModel, Field


class InductionFormFieldConfig(BaseModel):
    # Not editable - it's the key the submit endpoint parses. Sent back
    # unchanged by the editor so the server can match rows up.
    key: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=150)
    required: bool = False
    order: int = 0
    options: list[str] = Field(default_factory=list)


class InductionFormConfigResponse(BaseModel):
    fields: list[InductionFormFieldConfig]
    updated_at: datetime


class InductionFormConfigUpdate(BaseModel):
    fields: list[InductionFormFieldConfig]
