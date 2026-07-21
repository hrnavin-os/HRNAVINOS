"""Data access for Course documents."""
import uuid

from app.models.course import Course
from app.repositories.base_repository import BaseRepository


class CourseRepository(BaseRepository[Course]):
    model = Course

    def __init__(self) -> None:
        super().__init__(Course)

    async def code_exists(self, code: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"code": code}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Course.find_one(query) is not None
