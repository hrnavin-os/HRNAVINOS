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
from app.models.permission import Permission
from app.models.role import Role
from app.permissions.role_definitions import DEFAULT_ROLE_PERMISSIONS
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


async def backfill_role_permissions() -> int:
    """Grants a seeded role any permission its definition has gained since the
    database was seeded.

    DEFAULT_ROLE_PERMISSIONS is a seed, not a migration: adding a permission to
    a role there changes what a *fresh* database gets and leaves every existing
    one exactly as it was. So Admin kept the rights it was created with, and
    the Programs tab it had been given stayed invisible on the one database
    that matters.

    Additive on purpose. A permission taken out of the definition is left alone
    rather than revoked, because a permission granted by hand in Roles &
    Permissions is a decision somebody made, and a boot is no place to
    second-guess it.
    """
    permissions = {permission.code: permission.id for permission in await Permission.find({}).to_list()}
    granted = 0
    for name, codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = await Role.find_one({"name": name, "is_deleted": False})
        if not role:
            continue
        missing = [
            permissions[code] for code in codes if code in permissions and permissions[code] not in role.permission_ids
        ]
        if not missing:
            continue
        role.permission_ids = [*role.permission_ids, *missing]
        role.touch()
        await role.save()
        granted += len(missing)
        logger.info("Granted %d new permission(s) to the %s role.", len(missing), name)
    return granted


async def run_startup_backfills() -> None:
    for model in (Lead, InductionEntry):
        updated = await backfill_phone_normalized(model)
        if updated:
            logger.info("Backfilled phone_normalized on %d %s rows.", updated, model.Settings.name)
    await backfill_role_permissions()
