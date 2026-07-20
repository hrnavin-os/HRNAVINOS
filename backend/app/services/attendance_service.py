"""Business logic for the Attendance module."""
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.exceptions.base import NotFoundError
from app.models.attendance import Attendance
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.batch_repository import BatchRepository
from app.schemas.attendance_schema import AttendanceBulkMark, AttendanceUpdate
from app.schemas.common import PaginatedResponse, PaginationParams
from app.services.audit_service import AuditService


class AttendanceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.attendance = AttendanceRepository(db)
        self.batches = BatchRepository(db)
        self.audit = AuditService(db)

    def bulk_mark(self, data: AttendanceBulkMark, *, actor_id: uuid.UUID | None) -> list[Attendance]:
        if not self.batches.get_by_id(data.batch_id):
            raise NotFoundError("Specified batch does not exist.")

        results: list[Attendance] = []
        for entry in data.entries:
            existing = self.attendance.get_by_student_batch_date(entry.student_id, data.batch_id, data.date)
            if existing:
                self.attendance.update(
                    existing,
                    {"status": entry.status, "remarks": entry.remarks, "marked_by": actor_id, "updated_by": actor_id},
                )
                results.append(existing)
            else:
                record = Attendance(
                    student_id=entry.student_id,
                    batch_id=data.batch_id,
                    date=data.date,
                    status=entry.status,
                    remarks=entry.remarks,
                    marked_by=actor_id,
                    created_by=actor_id,
                    updated_by=actor_id,
                )
                self.attendance.create(record)
                results.append(record)

        self.audit.record(
            user_id=actor_id,
            action="MARK_ATTENDANCE",
            entity_type="Attendance",
            entity_id=str(data.batch_id),
            changes={"date": str(data.date), "count": len(results)},
        )
        self.db.commit()
        for record in results:
            self.db.refresh(record)
        return results

    def list_by_batch_date(self, batch_id: uuid.UUID, day: date) -> list[Attendance]:
        return self.attendance.list_by_batch_and_date(batch_id, day)

    def list(self, params: PaginationParams, *, student_id: uuid.UUID | None, batch_id: uuid.UUID | None) -> PaginatedResponse:
        filters = {}
        if student_id:
            filters["student_id"] = student_id
        if batch_id:
            filters["batch_id"] = batch_id
        items, total = self.attendance.list(
            page=params.page,
            page_size=params.page_size,
            sort_by=params.sort_by,
            sort_order=params.sort_order,
            filters=filters or None,
        )
        return PaginatedResponse.build(items, total, params.page, params.page_size)

    def update(self, attendance_id: uuid.UUID, data: AttendanceUpdate, *, actor_id: uuid.UUID | None) -> Attendance:
        record = self.attendance.get_by_id(attendance_id)
        if not record:
            raise NotFoundError("Attendance record not found.")
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_by"] = actor_id
        self.attendance.update(record, update_data)
        self.audit.record(
            user_id=actor_id,
            action="UPDATE",
            entity_type="Attendance",
            entity_id=str(record.id),
            changes=update_data,
        )
        self.db.commit()
        self.db.refresh(record)
        return record
