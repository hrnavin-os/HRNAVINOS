"""One-time data backfills, run at startup.

The deploy script restarts the app but doesn't run migrations, so a new derived
field that existing rows don't carry has to fill itself in. Each backfill here
is idempotent and only touches rows that are actually missing the value, so
every boot after the first one is a single cheap query that matches nothing.
"""
import logging

from pymongo import UpdateOne

from app.database.base import BaseDocument
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.utils.phone import normalize_phone

logger = logging.getLogger(__name__)


async def backfill_phone_normalized(model: type[BaseDocument]) -> int:
    """Fills `phone_normalized` from `phone` on rows created before the field
    existed.

    Without this, every lead and induction entry already in the database is
    invisible to mobile-number matching - the field they'd be matched on is
    simply absent - so the first Foundation Form submission after deploying
    would fail to find a perfectly good induction record.

    Done in Python rather than as an aggregation-pipeline update because the
    normalization is a regex strip plus a suffix take, which is a great deal
    clearer here than as `$regexFindAll`/`$reduce` stages.
    """
    collection = model.get_motor_collection()
    cursor = collection.find(
        {"$or": [{"phone_normalized": {"$exists": False}}, {"phone_normalized": None}]},
        {"_id": 1, "phone": 1},
    )
    operations = [
        UpdateOne({"_id": row["_id"]}, {"$set": {"phone_normalized": normalized}})
        async for row in cursor
        # Rows with no usable number stay unset. They'll be re-examined on the
        # next boot, which is harmless - a lead with no phone can't be matched
        # on one anyway.
        if (normalized := normalize_phone(row.get("phone"))) is not None
    ]
    if not operations:
        return 0
    result = await collection.bulk_write(operations, ordered=False)
    return result.modified_count


async def run_startup_backfills() -> None:
    for model in (Lead, InductionEntry):
        updated = await backfill_phone_normalized(model)
        if updated:
            logger.info("Backfilled phone_normalized on %d %s rows.", updated, model.Settings.name)
