"""Generic async repository providing common CRUD + pagination/filtering/sorting.

Concrete repositories subclass this for entity-specific queries; the base
keeps data-access mechanics (soft delete, pagination) in one place so
services never touch Beanie/Motor queries directly.
"""
import re
import uuid
from typing import Any, Generic, TypeVar

from app.database.base import BaseDocument

ModelType = TypeVar("ModelType", bound=BaseDocument)


class BaseRepository(Generic[ModelType]):
    model: type[ModelType]

    def __init__(self, model: type[ModelType] | None = None) -> None:
        if model is not None:
            self.model = model

    # ---------- Reads ----------
    async def get_by_id(self, entity_id: uuid.UUID, *, include_deleted: bool = False) -> ModelType | None:
        document = await self.model.get(entity_id)
        if document is None:
            return None
        if not include_deleted and document.is_deleted:
            return None
        return document

    def _build_query(
        self,
        *,
        search: str | None,
        search_fields: list[str] | None,
        include_deleted: bool,
        filters: dict[str, Any] | None,
    ) -> dict[str, Any]:
        query: dict[str, Any] = {}
        if not include_deleted:
            query["is_deleted"] = False

        if filters:
            for field, value in filters.items():
                if value is not None:
                    query[field] = value

        if search and search_fields:
            pattern = re.escape(search)
            query["$or"] = [{field: {"$regex": pattern, "$options": "i"}} for field in search_fields]

        return query

    async def list(
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
        query = self._build_query(
            search=search, search_fields=search_fields, include_deleted=include_deleted, filters=filters
        )

        total = await self.model.find(query).count()

        sort_expr = f"{'-' if sort_order == 'desc' else '+'}{sort_by}"
        items = await (
            self.model.find(query)
            .sort(sort_expr)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list()
        )
        return items, total

    # ---------- Writes ----------
    async def create(self, document: ModelType) -> ModelType:
        await document.insert()
        return document

    async def update(self, document: ModelType, data: dict[str, Any]) -> ModelType:
        for field, value in data.items():
            if hasattr(document, field):
                setattr(document, field, value)
        document.touch()
        await document.save()
        return document

    async def delete(
        self,
        document: ModelType,
        *,
        hard: bool = False,
        actor_id: uuid.UUID | None = None,
        reason: str | None = None,
    ) -> None:
        if hard:
            await document.delete()
        else:
            document.soft_delete(actor_id=actor_id, reason=reason)
            await document.save()
