"""Data access for Course entities."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.course import Course
from app.repositories.base_repository import BaseRepository


class CourseRepository(BaseRepository[Course]):
    model = Course

    def __init__(self, db: Session) -> None:
        super().__init__(db, Course)

    def code_exists(self, code: str, *, exclude_id=None) -> bool:
        stmt = select(Course.id).where(Course.code == code)
        if exclude_id:
            stmt = stmt.where(Course.id != exclude_id)
        return self.db.execute(stmt).first() is not None
