"""Idempotent database seed script.

Populates the permissions table, default roles (with their permission
grants), and the first Super Admin user. Safe to run multiple times.

Usage:
    python scripts/seed_db.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config.settings import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.database.session import SessionLocal  # noqa: E402
from app.models.permission import Permission  # noqa: E402
from app.models.role import Role  # noqa: E402
from app.models.user import User  # noqa: E402
from app.permissions.permission_codes import all_permission_definitions  # noqa: E402
from app.permissions.role_definitions import DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES  # noqa: E402


def seed_permissions(db) -> dict[str, Permission]:
    existing = {p.code: p for p in db.query(Permission).all()}
    for definition in all_permission_definitions():
        if definition["code"] not in existing:
            permission = Permission(**definition)
            db.add(permission)
            existing[definition["code"]] = permission
    db.commit()
    return {p.code: p for p in db.query(Permission).all()}


def seed_roles(db, permissions_by_code: dict[str, Permission]) -> dict[str, Role]:
    existing = {r.name: r for r in db.query(Role).all()}
    for role_name, permission_codes in DEFAULT_ROLE_PERMISSIONS.items():
        role = existing.get(role_name)
        if not role:
            role = Role(name=role_name, is_system=role_name in SYSTEM_ROLES)
            db.add(role)
            existing[role_name] = role
        role.permissions = [permissions_by_code[code] for code in permission_codes if code in permissions_by_code]
    db.commit()
    return {r.name: r for r in db.query(Role).all()}


def seed_superuser(db, roles_by_name: dict[str, Role]) -> None:
    existing = db.query(User).filter(User.email == settings.FIRST_SUPERUSER_EMAIL.lower()).first()
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
    db.add(superuser)
    db.commit()
    print(f"Created superuser: {superuser.email}")


def main() -> None:
    db = SessionLocal()
    try:
        print("Seeding permissions...")
        permissions_by_code = seed_permissions(db)
        print(f"  {len(permissions_by_code)} permissions in database.")

        print("Seeding roles...")
        roles_by_name = seed_roles(db, permissions_by_code)
        print(f"  {len(roles_by_name)} roles in database.")

        print("Seeding first superuser...")
        seed_superuser(db, roles_by_name)

        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
