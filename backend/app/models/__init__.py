"""Every Beanie document model, plus `ALL_DOCUMENTS` — the list handed to
`init_beanie(document_models=...)` in app/database/mongo.py."""
from app.models.admission import Admission
from app.models.attendance import Attendance
from app.models.audit_log import AuditLog
from app.models.batch import Batch
from app.models.batch_allocation import BatchAllocation
from app.models.company import Company
from app.models.course import Course
from app.models.finance_verification import FinanceVerification
from app.models.foundation_form_config import FoundationFormConfig
from app.models.google_sheet_connection import GoogleSheetConnection
from app.models.induction_entry import InductionEntry
from app.models.induction_form_config import InductionFormConfig
from app.models.invoice import Invoice
from app.models.lead import Lead
from app.models.login_history import LoginHistory
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.permission import Permission
from app.models.placement import Placement
from app.models.program import Program
from app.models.refresh_token import RefreshToken
from app.models.report import Report
from app.models.role import Role
from app.models.settings import AppSettings
from app.models.student import Student
from app.models.ticket import Ticket
from app.models.tutor import Tutor
from app.models.user import User

ALL_DOCUMENTS = [
    Admission,
    Attendance,
    AuditLog,
    Batch,
    BatchAllocation,
    Company,
    Course,
    FinanceVerification,
    FoundationFormConfig,
    GoogleSheetConnection,
    InductionEntry,
    InductionFormConfig,
    Invoice,
    Lead,
    LoginHistory,
    Notification,
    Payment,
    Permission,
    Placement,
    Program,
    RefreshToken,
    Report,
    Role,
    AppSettings,
    Student,
    Ticket,
    Tutor,
    User,
]

__all__ = [
    "ALL_DOCUMENTS",
    "Admission",
    "Attendance",
    "AuditLog",
    "Batch",
    "BatchAllocation",
    "Company",
    "Course",
    "FinanceVerification",
    "FoundationFormConfig",
    "GoogleSheetConnection",
    "InductionEntry",
    "InductionFormConfig",
    "Invoice",
    "Lead",
    "LoginHistory",
    "Notification",
    "Payment",
    "Permission",
    "Placement",
    "Program",
    "RefreshToken",
    "Report",
    "Role",
    "AppSettings",
    "Student",
    "Ticket",
    "Tutor",
    "User",
]
