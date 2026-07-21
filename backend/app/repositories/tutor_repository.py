"""Data access for Tutor documents."""
import uuid

from app.models.tutor import Tutor
from app.repositories.base_repository import BaseRepository


class TutorRepository(BaseRepository[Tutor]):
    model = Tutor

    def __init__(self) -> None:
        super().__init__(Tutor)

    async def get_by_user_id(self, user_id: uuid.UUID) -> Tutor | None:
        return await Tutor.find_one({"user_id": user_id, "is_deleted": False})
