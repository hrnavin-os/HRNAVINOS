"""Data access for Student entities."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.student import Student
from app.repositories.base_repository import BaseRepository


class StudentRepository(BaseRepository[Student]):
    model = Student

    def __init__(self, db: Session) -> None:
        super().__init__(db, Student)

    def email_exists(self, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        stmt = select(Student.id).where(Student.email == email.lower())
        if exclude_id:
            stmt = stmt.where(Student.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def get_by_user_id(self, user_id: uuid.UUID) -> Student | None:
        stmt = select(Student).where(Student.user_id == user_id, Student.is_deleted.is_(False))
        return self.db.execute(stmt).scalar_one_or_none()
