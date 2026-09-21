"""Keeping a student's group the same on both sides of the Induction link.

A student exists twice once they have converted: as the InductionEntry they
came in on, and as the Foundation Lead they became. Both carry the group, and
both are live at the same time - the attendance roll reads the entry (it covers
everyone who came through induction, converted or not), while the Foundation
board, the batch confirmation queue and the sheet export read the lead.

So a move made on either board has to reach the other, or the coordinator
printing the roll and the coordinator working the Foundation board would be
calling the same student into two different classes. The move is written on the
far side too, with the same attribution, rather than only the number - what
happened to a student is the same event whichever record you read it off.

Deliberately not a "single source of truth" with the other side reading through
the link: both boards filter and sort on the group, which a value resolved per
row could not do without a join per page.
"""
import uuid

from app.models.foundation_group import record_group_move
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead


async def mirror_group_move(
    record: InductionEntry | Lead, *, actor_id: uuid.UUID | None, actor_name: str | None
) -> None:
    """Copies `record`'s current group onto its counterpart, if it has one.

    Does nothing for an unlinked record, which is most of them: an induction
    entry that has not converted yet, or a Foundation lead whose number never
    came through induction.

    Silent when the counterpart has been deleted. The move on the record that
    was actually edited has already been written down and must not be undone by
    the other half of the pair having gone missing.
    """
    if isinstance(record, InductionEntry):
        far: InductionEntry | Lead | None = (
            await Lead.get(record.foundation_lead_id) if record.foundation_lead_id else None
        )
    else:
        far = await InductionEntry.get(record.induction_entry_id) if record.induction_entry_id else None
    if far is None:
        return
    if record_group_move(far, record.foundation_group, actor_id=actor_id, actor_name=actor_name):
        far.touch(actor_id)
        await far.save()
