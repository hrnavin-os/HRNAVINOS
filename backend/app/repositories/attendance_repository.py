"""Data access for Attendance documents."""
import uuid
from datetime import date

from app.models.attendance import Attendance
from app.repositories.base_repository import BaseRepository


class AttendanceRepository(BaseRepository[Attendance]):
    model = Attendance

    def __init__(self) -> None:
        super().__init__(Attendance)

    async def get_by_student_batch_date(
        self, student_id: uuid.UUID, batch_id: uuid.UUID, day: date
    ) -> Attendance | None:
        return await Attendance.find_one(
            {"student_id": student_id, "batch_id": batch_id, "date": day, "is_deleted": False}
        )

    async def list_by_batch_and_date(self, batch_id: uuid.UUID, day: date) -> list[Attendance]:
        return await Attendance.find(
            {"batch_id": batch_id, "date": day, "is_deleted": False}
        ).to_list()
