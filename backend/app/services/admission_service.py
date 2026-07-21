"""Business logic for the Admissions module."""
import uuid

from app.exceptions.base import NotFoundError
from app.models.admission import Admission
from app.models.enums import LeadStatus
from app.repositories.admission_repository import AdmissionRepository
from app.repositories.batch_repository import BatchRepository
from app.repositories.course_repository import CourseRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.student_repository import StudentRepository
from app.schemas.admission_schema import AdmissionCreate, AdmissionUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.audit_service import AuditService


class AdmissionService:
    def __init__(self) -> None:
        self.admissions = AdmissionRepository()
        self.students = StudentRepository()
        self.courses = CourseRepository()
        self.batches = BatchRepository()
        self.leads = LeadRepository()
        self.audit = AuditService()

    async def create(self, data: AdmissionCreate, *, actor_id: uuid.UUID | None) -> Admission:
        if not await self.students.get_by_id(data.student_id):
            raise NotFoundError("Specified student does not exist.")
        if not await self.courses.get_by_id(data.course_id):
            raise NotFoundError("Specified course does not exist.")
        if data.batch_id and not await self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")

        admission = Admission(
            **data.model_dump(), admitted_by=actor_id, created_by=actor_id, updated_by=actor_id
        )
        await self.admissions.create(admission)

        if data.lead_id:
            lead = await self.leads.get_by_id(data.lead_id)
            if lead:
                lead.status = LeadStatus.CONVERTED
                lead.updated_by = actor_id
                await lead.save()

        await self.audit.record(
            user_id=actor_id, action="CREATE", entity_type="Admission", entity_id=str(admission.id)
        )
        return admission

    async def get(self, admission_id: uuid.UUID) -> Admission:
        admission = await self.admissions.get_by_id(admission_id)
        if not admission:
            raise NotFoundError("Admission not found.")
        return admission

    async def list(self, params: PaginationParams, *, student_id: uuid.UUID | None = None) -> PaginatedResponse:
        items, total = await self.admissions.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters={"student_id": student_id} if student_id else None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    async def update(self, admission_id: uuid.UUID, data: AdmissionUpdate, *, actor_id: uuid.UUID | None) -> Admission:
        admission = await self.get(admission_id)
        if data.batch_id and not await self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        await self.admissions.update(admission, update_data)
        await self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Admission",
            entity_id=str(admission.id),
            changes=update_data,
        )
        return admission

    async def delete(self, admission_id: uuid.UUID, *, actor_id: uuid.UUID | None) -> None:
        admission = await self.get(admission_id)
        await self.admissions.delete(admission)
        await self.audit.record(
            user_id=actor_id, action="DELETE", entity_type="Admission", entity_id=str(admission.id)
        )
