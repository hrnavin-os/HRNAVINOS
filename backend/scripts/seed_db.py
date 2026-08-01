"""Idempotent database seed script.

Populates the permissions collection, default roles (with their permission
grants), and the first Super Admin user. Safe to run multiple times.

Usage:
    python scripts/seed_db.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config.settings import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.mongo import close_mongo_connection, connect_to_mongo  # noqa: E402
from app.models.permission import Permission  # noqa: E402
from app.models.role import Role  # noqa: E402
from app.models.user import User  # noqa: E402
from app.permissions.permission_codes import all_permission_definitions  # noqa: E402
from app.permissions.role_definitions import (  # noqa: E402
    DEFAULT_ROLE_PERMISSIONS,
    ROLE_SCOPED_SECTION,
    SYSTEM_ROLES,
)


async def seed_permissions() -> dict[str, Permission]:
    existing = {p.code: p for p in await Permission.find_all().to_list()}
    for definition in all_permission_definitions():
        if definition["code"] not in existing:
            permission = Permission(**definition)
            await permission.insert()
            existing[definition["code"]] = permission
    return existing


async def seed_roles(permissions_by_code: dict[str, Permission]) -> dict[str, Role]:
    existing = {r.name: r for r in await Role.find_all().to_list()}
    for role_name, permission_codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = existing.get(role_name)
        permission_ids = [permissions_by_code[code].id for code in permission_codes if code in permissions_by_code]
        scoped_section = ROLE_SCOPED_SECTION.get(role_name)
        if not role:
            role = Role(
                name=role_name,
                is_system=role_name in SYSTEM_ROLES,
                permission_ids=permission_ids,
                scoped_section=scoped_section,
            )
            await role.insert()
            existing[role_name] = role
        else:
            role.permission_ids = permission_ids
            role.scoped_section = scoped_section
            await role.save()
    return existing


async def seed_superuser(roles_by_name: dict[str, Role]) -> None:
    existing = await User.find_one({"email": settings.FIRST_SUPERUSER_EMAIL.lower()})
    if existing:
        print(f"Superuser already exists: {existing.email}")
        return

    superuser = User(
        email=settings.FIRST_SUPERUSER_EMAIL.lower(),
        password_hash=hash_password(settings.FIRST_SUPERUSER_PASSWORD),
        first_name="Super",
        last_name="Admin",
        role_id=roles_by_name["Super Admin"].id,
        is_active=True,
        is_verified=True,
    )
    await superuser.insert()
    print(f"Created superuser: {superuser.email}")


async def run_seed() -> None:
    print("Seeding permissions...")
    permissions_by_code = await seed_permissions()
    print(f"  {len(permissions_by_code)} permissions in database.")

    print("Seeding roles...")
    roles_by_name = await seed_roles(permissions_by_code)
    print(f"  {len(roles_by_name)} roles in database.")

    print("Seeding first superuser...")
    await seed_superuser(roles_by_name)

    print("Seed complete.")


async def main() -> None:
    await connect_to_mongo()
    try:
        await run_seed()
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
