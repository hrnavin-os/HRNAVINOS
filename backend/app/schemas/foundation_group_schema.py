"""The foundation group's shape on the wire, shared by both boards.

One definition rather than one per schema module: an induction entry and a
Foundation lead each carry a group and the moves it went through, the boards
render them with the same component, and two DTOs that drifted apart would
show the same move two different ways.
"""
from collections.abc import Iterable
from datetime import datetime

from pydantic import BaseModel

from app.models.foundation_group import FoundationGroupMove


class FoundationGroupMoveSchema(BaseModel):
    """One move between groups, as the boards print it.

    `by` - the mover's id - is deliberately left off: the name is already
    snapshotted beside it, and the id is of no use to a table cell.
    """

    from_group: int | None = None
    to_group: int | None = None
    at: datetime
    by_name: str | None = None
    # True when the change was recorded as a direct placement, not a move.
    direct: bool = False

    @classmethod
    def of(cls, moves: Iterable[FoundationGroupMove]) -> list["FoundationGroupMoveSchema"]:
        """The stored history, converted for a response.

        Every response carrying a group history goes through here, because the
        conversion is not optional and not obvious: FoundationGroupMove and this
        are different classes even though the field names line up, and Pydantic
        v2 will not coerce one model into the other - it raises. The same trap
        InductionFormConfig hit, which is why that route dumps to dicts first.

        What makes it worth a named method rather than a comprehension at each
        call site is when it goes wrong: an empty history validates against
        anything, so a response built the wrong way looks perfectly healthy
        until the first student is moved, and then the whole board 500s.
        """
        return [
            cls(
                from_group=move.from_group,
                to_group=move.to_group,
                at=move.at,
                by_name=move.by_name,
                direct=move.direct,
            )
            for move in moves
        ]
