"""Shared Pydantic-compatible field types for MongoDB documents."""
from decimal import Decimal
from typing import Annotated

from bson import Decimal128
from pydantic import BeforeValidator


def _coerce_decimal(value: object) -> object:
    """MongoDB stores decimals as BSON Decimal128; Beanie encodes Decimal ->
    Decimal128 automatically on write, but doesn't decode it back to
    `decimal.Decimal` on read, so this validator handles that direction."""
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return value


MongoDecimal = Annotated[Decimal, BeforeValidator(_coerce_decimal)]
