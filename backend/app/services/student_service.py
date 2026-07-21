"""Business logic for the Student Management module."""
import uuid

from app.exceptions.base import AlreadyExistsError, NotFoundError
from app.models.student import Student
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.common import PaginatedResponse, PaginationParams
from app.schemas.student_schema import StudentCreate, StudentUpdate
from app.services.audit_service import AuditService


class StudentService:
    def __init__(self) -> None:
        self.students = StudentRepository()
        self.courses = CourseRepository()
        self.batches = BatchRepository()
        self.audit = AuditService()

    async def create(self, data: StudentCreate, *, actor_id: uuid.UUID | None) -> Student:
        if await self.students.email_exists(data.email):
            raise AlreadyExistsError(f"A student with email '{data.email}' already exists.")
        if data.course_id and not await self.courses.get_by_id(data.course_id):
            raise NotFoundError("Specified course does not exist.")
        if data.batch_id and not await self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")

        payload = data.model_dump()
        payload["email"] = payload["email"].lower()
        student = Student(**payload, created_by=actor_id, updated_by=actor_id)
        await self.students.create(student)
        await self.audit.record(user_id=actor_id, action="CREATE", entity_type="Student", entity_id=str(student.id))
        return student

    async def get(self, student_id: uuid.UUID) -> Student:
        student = await self.students.get_by_id(student_id)
        if not student:
            raise NotFoundError("Student not found.")
        return student

    async def list(self, params: PaginationParams, *, batch_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = await self.students.list(
            page=params.page,
            page_size=params.page_size,
            search=params.search,
            search_fields=["first_name", "last_name", "email"],
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"batch_id": batch_id} if batch_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, student_id: uuid.UUID, data: StudentUpdate, *, actor_id: uuid.UUID | None) -> Student:
        student = await self.get(student_id)
        if data.batch_id and not await self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.students.update(student, update_data)
        await self.audit.record(
            user_id=actor_id, action="UPDATE", entity_type="Student", entity_id=str(student.id), changes=update_data
        )
        return student

    async def delete(self, student_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        student = await self.get(student_id)
        await self.students.delete(student)
        await self.audit.record(user_id=actor_id, action="DELETE", entity_type="Student", entity_id=str(student.id))
