"""Keeping a student's rejoin the same on both sides of the Induction link.

Like the group (see foundation_group_sync), it is stored on the InductionEntry
and on the Foundation Lead it became, and both boards print it after the name.
"""
import uuid

from app.models.induction_entry import InductionEntry
from app.models.lead import Lead


async def mirror_rejoin(record: InductionEntry | Lead, *, actor_id: uuid.UUID | None) -> None:
    """Copies `record`'s old batch onto its counterpart, if it has one."""
    if isinstance(record, InductionEntry):
        far: InductionEntry | Lead | None = (
            await Lead.get(record.foundation_lead_id) if record.foundation_lead_id else None
        )
    else:
        far = await InductionEntry.get(record.induction_entry_id) if record.induction_entry_id else None
    if far is None or far.rejoin_batch == record.rejoin_batch:
        return
    far.rejoin_batch = record.rejoin_batch
    far.touch(actor_id)
    await far.save()
