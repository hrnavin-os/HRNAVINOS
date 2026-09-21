"""One recorded move between foundation class groups.

Kept on the record itself rather than left to the audit log, because this is
something the boards have to print: "Group 2, moved from Group 1" is what tells
a coordinator the roll they printed last week is out of date. The audit log
answers "who changed what" for the whole application and is not something a
table renders a column out of.

Shared by InductionEntry and Lead. Both can have their group corrected - the
entry on the Induction board, the lead on the Foundation board - and a move
means the same thing on either, so it is written down the same way on both.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.database.base import utcnow


class FoundationGroupMove(BaseModel):
    # None on `from_group` is the first time a group was set at all, which is
    # not a move between groups and reads as "put into Group 2" rather than
    # "moved from nothing". None on `to_group` is the group being cleared.
    from_group: int | None = None
    to_group: int | None = None
    at: datetime = Field(default_factory=utcnow)
    by: uuid.UUID | None = None
    # The mover's name as it was at the time, so a page of rows renders without
    # a user lookup each - the same reason the attendance marks snapshot it.
    by_name: str | None = Field(default=None, max_length=150)


def record_group_move(
    record, new_group: int | None, *, actor_id: uuid.UUID | None, actor_name: str | None
) -> bool:
    """Moves `record` into `new_group`, writing down where it came from.

    Returns whether anything actually changed, so a save that merely restates
    the group a student is already in doesn't file a move saying they were
    moved from Group 2 to Group 2.

    Takes anything carrying `foundation_group` and `foundation_group_history` -
    an InductionEntry or a Lead - because a move means the same thing on both
    and writing it twice is how the two start disagreeing about what a move is.
    """
    if record.foundation_group == new_group:
        return False
    record.foundation_group_history.append(
        FoundationGroupMove(
            from_group=record.foundation_group,
            to_group=new_group,
            by=actor_id,
            by_name=actor_name,
        )
    )
    record.foundation_group = new_group
    return True


def pop_group_move(
    record, update_data: dict, *, actor_id: uuid.UUID | None, actor_name: str | None
) -> dict | None:
    """Applies a pending group change out of an update payload, and says what
    it was - `{"from": 1, "to": 2}` - or None if there wasn't one.

    Takes the change *out* of `update_data` on purpose. Both services hand that
    dict to a repository which saves the whole document, so the move appended
    here is already on its way to the database; leaving the field in would let
    a plain $set write the group over the top of the history that explains it.
    What comes back is for the audit entry, which wants the move rather than
    the list it was appended to.

    The three places a group can be edited - the Induction board, the
    Foundation board, and Form Check - all go through here, so a move can't be
    recorded on one of them and quietly skipped on another.
    """
    if "foundation_group" not in update_data:
        return None
    was = record.foundation_group
    moved = record_group_move(
        record, update_data.pop("foundation_group"), actor_id=actor_id, actor_name=actor_name
    )
    return {"from": was, "to": record.foundation_group} if moved else None
