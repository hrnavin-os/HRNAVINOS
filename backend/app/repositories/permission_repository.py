"""Data access for Permission entities."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.permission import Permission
from app.repositories.base_repository import BaseRepository


class PermissionRepository(BaseRepository[Permission]):
    model = Permission

    def __init__(self, db: Session) -> None:
        super().__init__(db, Permission)

    def get_by_code(self, code: str) -> Permission | None:
        stmt = select(Permission).where(Permission.code == code, Permission.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_ids(self, ids: list[uuid.UUID]) -> list[Permission]:
        stmt = select(Permission).where(Permission.id.in_(ids), Permission.is_deleted.is_(False))
        return list(self.db.execute(stmt).scalars().all())

    def list_by_module(self, module: str) -> list[Permission]:
        stmt = select(Permission).where(Permission.module == module, Permission.is_deleted.is_(False))
        return list(self.db.execute(stmt).scalars().all())
