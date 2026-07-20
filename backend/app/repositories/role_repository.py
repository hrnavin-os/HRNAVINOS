"""Data access for Role entities."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.role import Role
from app.repositories.base_repository import BaseRepository


class RoleRepository(BaseRepository[Role]):
    model = Role

    def __init__(self, db: Session) -> None:
        super().__init__(db, Role)

    def get_by_name(self, name: str) -> Role | None:
        stmt = select(Role).where(Role.name == name, Role.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def name_exists(self, name: str, *, exclude_id=None) -> bool:
        stmt = select(Role.id).where(Role.name == name)
        if exclude_id:
            stmt = stmt.where(Role.id != exclude_id)
        return self.db.execute(stmt).first() is not None
