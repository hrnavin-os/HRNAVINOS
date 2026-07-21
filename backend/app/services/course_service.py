"""Business logic for the Course Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.course import Course
from app.repositories.course_repository import CourseRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.course_schema import CourseCreate, CourseUpdate
from app.services.audit_service import AuditService


class CourseService:
    def __init__(self) -> None:
        self.courses = CourseRepository()
        self.audit = AuditService()

    async def create(self, data: CourseCreate, *, actor_id: uuid.UUID | None) -> Course:
        if await self.courses.code_exists(data.code):
            raise AlreadyExistsError(f"A course with code '{data.code}' already exists.")
        course = Course(**data.model_dump(), created_by=actor_id, updated_by=actor_id)
        await self.courses.create(course)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Course", entity_id=str(course.id))
        return course

    async def get(self, course_id: uuid.UUID) -> Course:
        course = await self.courses.get_by_id(course_id)
        if not course:
            raise NotFoundError("Course not found.")
        return course

    async def list(self, params: PaginationParams) -> PaginatedResponse:
        items, total = await self.courses.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["name", "code"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, course_id: uuid.UUID, data: CourseUpdate, *, actor_id: uuid.UUID | None) -> Course:
        course = await self.get(course_id)
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.courses.update(course, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Course", entity_id=str(course.id), changes=update_data
        )
        return course

    async def delete(self, course_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        course = await self.get(course_id)
        await self.courses.delete(course)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Course", entity_id=str(course.id))
