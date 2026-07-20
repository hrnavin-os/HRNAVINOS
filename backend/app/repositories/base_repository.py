"""Generic repository providing common CRUD + pagination/filtering/sorting.

Concrete repositories subclass this for entity-specific queries; the base
keeps data-access mechanics (soft delete, pagination) in one place so
services never touch SQLAlchemy directly.
"""
import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session

from app.database.base import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


class BaseRepository(Generic[ModelType]):
    model: type[ModelType]

    def __init__(self, db: Session, model: type[ModelType] | None = None) -> None:
        self.db = db
        if model is not None:
            self.model = model

    # ---------- Reads ----------
    def get_by_id(self, entity_id: uuid.UUID, *, include_deleted: bool = False) -> ModelType | None:
        stmt = select(self.model).where(self.model.id == entity_id)
        if not include_deleted:
            stmt = stmt.where(self.model.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()

    def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        search_fields: list[str] | None = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        include_deleted: bool = False,
        filters: dict[str, Any] | None = None,
    ) -> tuple[list[ModelType], int]:
        stmt = select(self.model)
        count_stmt = select(func.count()).select_from(self.model)

        if not include_deleted:
            stmt = stmt.where(self.model.is_deleted.is_(False))
            count_stmt = count_stmt.where(self.model.is_deleted.is_(False))

        if filters:
            for field, value in filters.items():
                if value is None or not hasattr(self.model, field):
                    continue
                stmt = stmt.where(getattr(self.model, field) == value)
                count_stmt = count_stmt.where(getattr(self.model, field) == value)

        if search and search_fields:
            like = f"%{search}%"
            conditions = [
                getattr(self.model, field).ilike(like)
                for field in search_fields
                if hasattr(self.model, field)
            ]
            if conditions:
                from sqlalchemy import or_

                stmt = stmt.where(or_(*conditions))
                count_stmt = count_stmt.where(or_(*conditions))

        if hasattr(self.model, sort_by):
            column = getattr(self.model, sort_by)
            stmt = stmt.order_by(asc(column) if sort_order == "asc" else desc(column))

        total = self.db.execute(count_stmt).scalar_one()
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        items = list(self.db.execute(stmt).scalars().all())
        return items, total

    # ---------- Writes ----------
    def create(self, entity: ModelType) -> ModelType:
        self.db.add(entity)
        self.db.flush()
        return entity

    def update(self, entity: ModelType, data: dict[str, Any]) -> ModelType:
        for field, value in data.items():
            if hasattr(entity, field):
                setattr(entity, field, value)
        self.db.flush()
        return entity

    def delete(self, entity: ModelType, *, hard: bool = False) -> None:
        if hard:
            self.db.delete(entity)
        else:
            entity.soft_delete()
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
