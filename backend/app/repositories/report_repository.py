"""Read-only aggregation queries backing the Reports module."""
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.admission import Admission
from app.models.attendance import Attendance
from app.models.batch import Batch
from app.models.course import Course
from app.models.enums import AttendanceStatus, PaymentStatus
from app.models.lead import Lead
from app.models.payment import Payment


class ReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def revenue_by_month(self, limit_months: int = 12) -> list[dict]:
        month_expr = func.to_char(Payment.payment_date, "YYYY-MM")
        stmt = (
            select(
                month_expr.label("month"),
                func.coalesce(func.sum(Payment.amount), 0).label("total_collected"),
                func.count(Payment.id).label("payment_count"),
            )
            .where(Payment.status == PaymentStatus.VERIFIED, Payment.is_deleted.is_(False))
            .group_by(month_expr)
            .order_by(month_expr.desc())
            .limit(limit_months)
        )
        return [dict(row._mapping) for row in self.db.execute(stmt)]

    def admissions_by_course(self) -> list[dict]:
        stmt = (
            select(
                Course.name.label("course_name"),
                func.count(Admission.id).label("admissions_count"),
                func.coalesce(func.sum(Admission.total_fee), 0).label("total_revenue"),
            )
            .join(Admission, Admission.course_id == Course.id)
            .where(Admission.is_deleted.is_(False))
            .group_by(Course.name)
            .order_by(func.count(Admission.id).desc())
        )
        return [dict(row._mapping) for row in self.db.execute(stmt)]

    def attendance_by_batch(self) -> list[dict]:
        present_case = case((Attendance.status == AttendanceStatus.PRESENT, 1), else_=0)
        absent_case = case((Attendance.status == AttendanceStatus.ABSENT, 1), else_=0)
        stmt = (
            select(
                Batch.name.label("batch_name"),
                func.count(Attendance.id).label("total_sessions"),
                func.sum(present_case).label("present_count"),
                func.sum(absent_case).label("absent_count"),
            )
            .join(Attendance, Attendance.batch_id == Batch.id)
            .where(Attendance.is_deleted.is_(False))
            .group_by(Batch.name)
        )
        rows = [dict(row._mapping) for row in self.db.execute(stmt)]
        for row in rows:
            total = row["total_sessions"] or 1
            row["attendance_rate"] = round((row["present_count"] or 0) / total * 100, 2)
        return rows

    def lead_conversion(self) -> list[dict]:
        stmt = (
            select(Lead.status.label("status"), func.count(Lead.id).label("count"))
            .where(Lead.is_deleted.is_(False))
            .group_by(Lead.status)
        )
        return [dict(row._mapping) for row in self.db.execute(stmt)]
