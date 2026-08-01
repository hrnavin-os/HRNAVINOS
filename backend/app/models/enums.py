"""Shared status/type enums used across business models.

Each is a plain `StrEnum`; Beanie/Pydantic serialize them as plain strings
in MongoDB documents, so adding a new value later is just a data change.
"""
from enum import StrEnum


class LeadSource(StrEnum):
    WEBSITE = "website"
    REFERRAL = "referral"
    SOCIAL_MEDIA = "social_media"
    WALK_IN = "walk_in"
    PHONE_INQUIRY = "phone_inquiry"
    ADVERTISEMENT = "advertisement"
    FOUNDATION_FORM = "foundation_form"
    OTHER = "other"


class FormSection(StrEnum):
    A = "a"
    B = "b"
    C = "c"


class ProgramInterest(StrEnum):
    ONLY_RECRUITMENT = "only_recruitment"
    RECRUITMENT_INTERNSHIP = "recruitment_internship"
    RECRUITMENT_GENERALIST = "recruitment_generalist"
    RECRUITMENT_GENERALIST_INTERNSHIP = "recruitment_generalist_internship"


class PaymentPlanOption(StrEnum):
    SINGLE_SHOT = "single_shot"
    TWO_SHOT = "two_shot"
    EMI_6_WEEKS = "emi_6_weeks"


class PaymentTimeline(StrEnum):
    IMMEDIATE = "immediate"
    TOMORROW = "tomorrow"
    DAY_AFTER_TOMORROW = "day_after_tomorrow"


class InstallmentPaymentMode(StrEnum):
    CARD = "card"
    UPI = "upi"
    NETBANKING = "netbanking"


class LeadStatus(StrEnum):
    NEW_LEAD = "new_lead"
    RNR = "rnr"
    PRE_SCREENING = "pre_screening"
    FINANCIAL_APPROVAL = "financial_approval"
    BATCH_CONFIRMATION = "batch_confirmation"
    LOST = "lost"


class AdmissionStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class StudentStatus(StrEnum):
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    DROPPED = "dropped"


class BatchStatus(StrEnum):
    UPCOMING = "upcoming"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TutorStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class AttendanceStatus(StrEnum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"


class PaymentMethod(StrEnum):
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class InvoiceStatus(StrEnum):
    UNPAID = "unpaid"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PlacementStatus(StrEnum):
    APPLIED = "applied"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    SELECTED = "selected"
    REJECTED = "rejected"
    JOINED = "joined"


class NotificationType(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class TicketStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class VerificationDecision(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"


class ReportType(StrEnum):
    REVENUE = "revenue"
    ADMISSIONS = "admissions"
    ATTENDANCE = "attendance"
    LEAD_CONVERSION = "lead_conversion"
