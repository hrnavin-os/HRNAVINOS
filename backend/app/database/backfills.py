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
from app.permissions.permission_codes import all_permission_definitions
from app.permissions.role_definitions import DEFAULT_ROLE_PERMISSIONS, ROLE_SCOPED_SECTION
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


async def backfill_foundation_group(model: type[BaseDocument], *, date_field: str) -> int:
    """Writes down the group every existing row was already being shown as.

    The group used to be computed on read from a date - the 1st-15th of the
    month was Group 1, the 16th onward Group 2 - and is now a stored field that
    people set and change (app/utils/foundation_groups.py). Without this, every
    lead and induction entry in the database would lose the group its board has
    been printing for months the moment that rule stopped being applied, and
    someone would have to re-enter thousands of them by hand.

    So the old rule runs one last time, here, and its answer is written down.
    It is only an opening position: from this point on the group is whatever
    somebody says it is.

    Only touches rows with no group at all, so it can't overwrite a move made
    after the first boot, and so every boot after that matches nothing.
    """
    collection = model.get_motor_collection()
    result = await collection.update_many(
        {
            "$or": [{"foundation_group": {"$exists": False}}, {"foundation_group": None}],
            # Rows whose date is missing or isn't a date get no group rather
            # than Group 1: $dayOfMonth of null is null, which sorts below
            # every number and would otherwise sweep the lot into the first
            # group. "Nobody has said" is the honest answer for them.
            date_field: {"$type": "date"},
        },
        [
            {
                "$set": {
                    "foundation_group": {
                        "$cond": [{"$lte": [{"$dayOfMonth": f"${date_field}"}, 15]}, 1, 2]
                    },
                    # The history stays empty: these rows were never moved,
                    # they were only ever being read off a calendar, and a
                    # board that said "moved to Group 1" about all of them
                    # would be reporting an event that never happened.
                    "foundation_group_history": [],
                }
            }
        ],
    )
    return result.modified_count


async def sync_permission_catalog() -> set[str]:
    """Inserts a Permission row for any code the app has gained since the
    database was seeded.

    scripts/seed_db.py writes this catalogue, and it only ever runs by hand on
    a fresh database - the deploy restarts the app and nothing else. So a new
    permission code existed in Python and nowhere in Mongo, which made
    backfill_role_permissions below a no-op for it (it can only grant rows that
    exist) and left the feature behind it unreachable on the one database that
    matters.

    Insert-only. Codes are never removed here: a permission that has left the
    enum may still be granted to a role somebody edited by hand, and deleting
    the row would silently revoke it.

    Returns the codes inserted on *this* boot. Every later boot returns an
    empty set for them, which is what makes it safe to hang a one-shot
    migration off the result - see backfill_navigation_permissions below.
    """
    existing = {permission.code for permission in await Permission.find({}).to_list()}
    missing = [definition for definition in all_permission_definitions() if definition["code"] not in existing]
    if not missing:
        return set()
    await Permission.insert_many([Permission(**definition) for definition in missing])
    logger.info("Added %d new permission(s) to the catalogue.", len(missing))
    return {definition["code"] for definition in missing}


# A menu that used to be reachable on somebody else's permission, mapped to the
# permission that used to open it. When the new code appears in the catalogue
# for the first time, whoever could already reach the menu is granted it, so
# splitting the permission apart doesn't quietly take the page away from them.
GRANDFATHERED_NAV_PERMISSIONS: dict[str, str] = {
    # Statistics and Form Collection both rode on leads.view.
    "lead_analytics.view": "leads.view",
    "form_collection.view": "leads.view",
    # WhatsApp Links rode on the Batch Confirmation board's.
    "whatsapp_links.view": "batch_confirmation.view",
}

# Notifications had no permission at all: it was shown to any user whose role
# is scoped to a section, since Finance's payment reminders are addressed to
# them. So the thing to grandfather on is the scope, not another code.
SCOPED_ONLY_NAV_PERMISSION = "notifications.view"


async def backfill_navigation_permissions(new_codes: set[str]) -> int:
    """Grants each newly split-out menu permission to the roles that could
    already open that menu.

    Every sidebar entry now carries a permission of its own, so a role can be
    given or refused each page individually. Four of them previously had none:
    they were gated on a neighbour's code, or on nothing but the user being a
    Section Admin. Introducing their codes would therefore have hidden four
    working pages from every role in the database the moment this deployed.

    Runs once, on the boot where the code first enters the catalogue. That
    matters: this is a migration, not a default. Re-running it every boot would
    re-grant Statistics to anyone holding leads.view, which would make the new
    permission impossible to take away - the opposite of the point of it.
    """
    wanted = {code: source for code, source in GRANDFATHERED_NAV_PERMISSIONS.items() if code in new_codes}
    scoped_wanted = SCOPED_ONLY_NAV_PERMISSION in new_codes
    if not wanted and not scoped_wanted:
        return 0

    permissions = {permission.code: permission.id for permission in await Permission.find({}).to_list()}
    granted = 0
    for role in await Role.find({"is_deleted": False}).to_list():
        held = set(role.permission_ids)
        additions = [
            permissions[code]
            for code, source in wanted.items()
            if code in permissions and permissions.get(source) in held and permissions[code] not in held
        ]
        if (
            scoped_wanted
            and role.scoped_section
            and SCOPED_ONLY_NAV_PERMISSION in permissions
            and permissions[SCOPED_ONLY_NAV_PERMISSION] not in held
        ):
            additions.append(permissions[SCOPED_ONLY_NAV_PERMISSION])
        if not additions:
            continue
        role.permission_ids = [*role.permission_ids, *additions]
        role.touch()
        await role.save()
        granted += len(additions)
        logger.info("Kept %d menu(s) open on the %s role after splitting their permissions out.", len(additions), role.name)
    return granted


async def _roles_for_definition(name: str) -> list[Role]:
    """Which live roles a DEFAULT_ROLE_PERMISSIONS entry describes.

    Normally the one with that name. But a section admin's role gets renamed -
    the seed calls it "A-Section Admin" and the database in use calls it
    "Admin A-Section" - and a name lookup then silently matches nothing, so
    the role quietly stops receiving anything the definition gains. For the
    three section-scoped definitions the section is the stable identity, not
    the name: a role scoped to "a" *is* the A-Section Admin whatever it has
    been called since. All of them, not the first found, since an installation
    is free to have more than one role working a section.
    """
    named = await Role.find({"name": name, "is_deleted": False}).to_list()
    if named:
        return named
    section = ROLE_SCOPED_SECTION.get(name)
    if section is None:
        return []
    return await Role.find({"scoped_section": section, "is_deleted": False}).to_list()


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
    roles_and_codes = [
        (role, codes)
        for name, codes in DEFAULT_ROLE_PERMISSIONS.items()
        for role in await _roles_for_definition(name)
    ]
    for role, codes in roles_and_codes:
        missing = [
            permissions[code] for code in codes if code in permissions and permissions[code] not in role.permission_ids
        ]
        if not missing:
            continue
        role.permission_ids = [*role.permission_ids, *missing]
        role.touch()
        await role.save()
        granted += len(missing)
        logger.info("Granted %d new permission(s) to the %s role.", len(missing), role.name)
    return granted


async def run_startup_backfills() -> None:
    for model in (Lead, InductionEntry):
        updated = await backfill_phone_normalized(model)
        if updated:
            logger.info("Backfilled phone_normalized on %d %s rows.", updated, model.Settings.name)
    # Each collection off its own date, the one the old rule read: an induction
    # entry was grouped by when it registered, a lead by when its Foundation
    # Form landed.
    for model, date_field in ((Lead, "created_at"), (InductionEntry, "registration_date")):
        updated = await backfill_foundation_group(model, date_field=date_field)
        if updated:
            logger.info("Backfilled foundation_group on %d %s rows.", updated, model.Settings.name)
    # Order matters: a role can only be granted a permission that exists, so
    # the catalogue is topped up first.
    new_codes = await sync_permission_catalog()
    # Then the roles that could already reach a newly split-out menu keep it,
    # before the seeded defaults are topped up on top.
    await backfill_navigation_permissions(new_codes)
    await backfill_role_permissions()
