"""Data access for Permission documents."""
import uuid

from app.models.permission import Permission
from app.repositories.base_repository import BaseRepository


class PermissionRepository(BaseRepository[Permission]):
    model = Permission

    def __init__(self) -> None:
        super().__init__(Permission)

    async def get_by_code(self, code: str) -> Permission | None:
        return await Permission.find_one({"code": code, "is_deleted": False})

    async def get_by_ids(self, ids: list[uuid.UUID]) -> list[Permission]:
        if not ids:
            return []
        return await Permission.find({"_id": {"$in": ids}, "is_deleted": False}).to_list()

    async def list_by_module(self, module: str) -> list[Permission]:
        return await Permission.find({"module": module, "is_deleted": False}).to_list()
