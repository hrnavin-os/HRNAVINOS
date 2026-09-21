"""The foundation group's shape on the wire, shared by both boards.

One definition rather than one per schema module: an induction entry and a
Foundation lead each carry a group and the moves it went through, the boards
render them with the same component, and two DTOs that drifted apart would
show the same move two different ways.
"""
from datetime import datetime

from pydantic import BaseModel


class FoundationGroupMoveSchema(BaseModel):
    """One move between groups, as the boards print it.

    `by` - the mover's id - is deliberately left off: the name is already
    snapshotted beside it, and the id is of no use to a table cell.
    """

    from_group: int | None = None
    to_group: int | None = None
    at: datetime
    by_name: str | None = None
