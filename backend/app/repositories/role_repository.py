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

    async def list_by_scoped_section(self, code: str) -> list[Role]:
        """Every role pinned to one Form Collection section - i.e. that
        section's admins. A section can have more than one such role, so this
        returns a list rather than assuming the seeded "Admin X-Section"."""
        return await Role.find({"scoped_section": code, "is_deleted": False}).to_list()
