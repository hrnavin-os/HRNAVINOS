"""Import every model so `Base.metadata` is fully populated for Alembic
autogenerate and so string-based `relationship()` targets resolve correctly."""
from app.models.admission import Admission
from app.models.attendance import Attendance
from app.models.audit_log import AuditLog
from app.models.batch import Batch
from app.models.course import Course
from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.login_history import LoginHistory
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.permission import Permission
from app.models.placement import Placement
from app.models.refresh_token import RefreshToken
from app.models.role import Role
from app.models.student import Student
from app.models.ticket import Ticket
from app.models.tutor import Tutor
from app.models.user import User

__all__ = [
    "Admission",
    "Attendance",
    "AuditLog",
    "Batch",
    "Course",
    "Invoice",
    "Lead",
    "LoginHistory",
    "Notification",
    "Payment",
    "Permission",
    "Placement",
    "RefreshToken",
    "Role",
    "Student",
    "Ticket",
    "Tutor",
    "User",
]
