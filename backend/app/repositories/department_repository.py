"""Data access for Department documents."""
import re
import uuid

from app.models.department import Department
from app.models.user import User
from app.repositories.base_repository import BaseRepository


class DepartmentRepository(BaseRepository[Department]):
    model = Department

    def __init__(self) -> None:
        super().__init__(Department)

    async def name_exists(self, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        """Case-insensitive, among live departments only - see the note on
        the Department model."""
        query: dict = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "is_deleted": False}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        return await Department.find_one(query) is not None

    async def staff_counts(self, department_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """Live users per department, in one aggregation for a whole page."""
        if not department_ids:
            return {}
        pipeline = [
            {"$match": {"department_id": {"$in": department_ids}, "is_deleted": False}},
            {"$group": {"_id": "$department_id", "count": {"$sum": 1}}},
        ]
        rows = await User.get_motor_collection().aggregate(pipeline).to_list(length=None)
        return {row["_id"]: row["count"] for row in rows}
