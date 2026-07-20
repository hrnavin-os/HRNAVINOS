"""Business logic for the Course Management module."""
import uuid

from sqlalchemy.orm import Session

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.course import Course
from app.repositories.course_repository import CourseRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.course_schema import CourseCreate, CourseUpdate
from app.services.audit_service import AuditService


class CourseService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.courses = CourseRepository(db)
        self.audit = AuditService(db)

    def create(self, data: CourseCreate, *, actor_id: uuid.UUID | None) -> Course:
        if self.courses.code_exists(data.code):
            raise AlreadyExistsError(f"A course with code '{data.code}' already exists.")
        course = Course(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        self.courses.create(course)
        self.audit.record(user_id=actor_id, action="CREATE", entity_type="Course", entity_id=str(course.id))
        self.db.commit()
        self.db.refresh(course)
        return course

    def get(self, course_id: uuid.UUID) -> Course:
        course = self.courses.get_by_id(course_id)
        if not course:
            raise NotFoundError("Course not found.")
        return course

    def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = self.courses.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "code"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, course_id: uuid.UUID, data: CourseUpdate, *, actor_id: uuid.UUID | None) -> Course:
        course = self.get(course_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.courses.update(course, update_data)
        self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Course", entity_id=str(course.id), changes=update_data
        )
        self.db.commit()
        self.db.refresh(course)
        return course

    def delete(self, course_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        course = self.get(course_id)
        self.courses.delete(course)
        self.audit.record(user_id=actor_id, action="DELETE", entity_type="Course", entity_id=str(course.id))
        self.db.commit()
