"""Data access for Student documents."""
import uuid

from app.models.student import Student
from app.repositories.base_repository import BaseRepository


class StudentRepository(BaseRepository[Student]):
    model = Student

    def __init__(self) -> None:
        super().__init__(Student)

    async def email_exists(self, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        query: dict = {"email": email.lower()}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Student.find_one(query) is not None

    async def get_by_user_id(self, user_id: uuid.UUID) -> Student | None:
        return await Student.find_one({"user_id": user_id, "is_deleted": False})
