"""Data access for Attendance entities."""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.repositories.base_repository import BaseRepository


class AttendanceRepository(BaseRepository[Attendance]):
    model = Attendance

    def __init__(self, db: Session) -> None:
        super().__init__(db, Attendance)

    def get_by_student_batch_date(
        self, student_id: uuid.UUID, batch_id: uuid.UUID, day: date
    ) -> Attendance | None:
        stmt = select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.batch_id == batch_id,
            Attendance.date == day,
            Attendance.is_deleted.is_(False),
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def list_by_batch_and_date(self, batch_id: uuid.UUID, day: date) -> list[Attendance]:
        stmt = select(Attendance).where(
            Attendance.batch_id == batch_id, Attendance.date == day, Attendance.is_deleted.is_(False)
        )
        return list(self.db.execute(stmt).scalars().all())
