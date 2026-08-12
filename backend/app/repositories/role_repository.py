"""Data access for Role documents."""
import uuid

from app.models.role import Role
from app.repositories.base_repository import BaseRepository


class RoleRepository(BaseRepository[Role]):
    model = Role

    def __init__(self) -> None:
        super().__init__(Role)

    async def get_by_name(self, name: str) -> Role | None:
        return await Role.find_one({"name": name, "is_deleted": False})

    async def name_exists(self, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"name": name}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Role.find_one(query) is not None

    async def list_scoped(self) -> list[Role]:
        """Every Section Admin role, whatever its section. Sorted by creation
        so the round-robin that walks this list has a stable order between
        requests rather than whatever Mongo returns first."""
        roles = await Role.find(
            {"scoped_section": {"$ne": None}, "is_deleted": False}
        ).to_list()
        return sorted(roles, key=lambda role: (role.created_at, str(role.id)))

    async def list_by_scoped_section(self, code: str) -> list[Role]:
        """Every role pinned to one Form Collection section - i.e. that
        section's admins. A section can have more than one such role, so this
        returns a list rather than assuming the seeded "Admin X-Section"."""
        return await Role.find({"scoped_section": code, "is_deleted": False}).to_list()

    async def list_with_permission(self, permission_id: uuid.UUID) -> list[Role]:
        """Every role holding one permission.

        How to find "the HR Coordinators" without naming them: role names are
        editable and a site may well have several roles that do the job, so
        matching on the name would quietly stop notifying somebody the day it
        was renamed. What the notification actually needs is whoever is allowed
        to act on it, which is exactly what holding the permission means.
        """
        return await Role.find({"permission_ids": permission_id, "is_deleted": False}).to_list()
