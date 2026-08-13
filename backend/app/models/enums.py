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


class ProgramInterest(StrEnum):
    ONLY_RECRUITMENT = "only_recruitment"
    RECRUITMENT_INTERNSHIP = "recruitment_internship"
    RECRUITMENT_GENERALIST = "recruitment_generalist"
    RECRUITMENT_GENERALIST_INTERNSHIP = "recruitment_generalist_internship"


class PaymentPlanOption(StrEnum):
    SINGLE_SHOT = "single_shot"
    TWO_SHOT = "two_shot"
    EMI_6_WEEKS = "emi_6_weeks"


# Manually-tracked pricing tier a staffer records on a call - independent of
# PaymentPlanOption/installments (which drive the structured Foundation Form
# payment-collection flow with real computed amounts).
class PaymentOption(StrEnum):
    SINGLE_10K = "single_10k"
    SINGLE_15K = "single_15k"
    SINGLE_17_5K = "single_17_5k"
    TWO_10K = "two_10k"
    TWO_15K = "two_15k"
    TWO_18_5K = "two_18_5k"
    EMI_3300 = "emi_3300"
    EMI_2500 = "emi_2500"
    EMI_1500 = "emi_1500"


# Sales call disposition, set by whoever is following up with the lead.
class PaymentCallRemark(StrEnum):
    CONFIRMED_TO_PAY = "confirmed_to_pay"
    ONBOARDED = "onboarded"
    QUIT = "quit"
    WILL_PAY_PENDING = "will_pay_pending"
    DNP = "dnp"
    CALL_BACK = "call_back"
    NEED_TO_DISCUSS = "need_to_discuss"


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


class InductionStatus(StrEnum):
    """Which of the board's three buckets an induction entry sits in.

    Derived, never stored: from InductionEntry.foundation_lead_id, which the
    mobile-number match writes, and from the call remark. Those are the facts
    themselves - a status field beside them would be a copy, and the copy is
    what goes stale the day something sets one without the other.

    A partition, not three overlapping filters. Quit wins over the other two:
    somebody who has quit is not "currently in Induction" whatever else is true
    of them, and counting them in two buckets would make the three cards sum to
    more than the board holds.
    """

    PENDING_INDUCTION = "pending_induction"
    MOVED_TO_FOUNDATION = "moved_to_foundation"
    QUIT = "quit"


class WhatsAppGroupStatus(StrEnum):
    """Where a candidate is in the WhatsApp group onboarding.

    Never stored on the lead. It's a pure function of three timestamps
    (see Lead.whatsapp_status), so it can't drift from them and needs no job
    to move anyone into FOLLOW_UP_REQUIRED when their wait runs out - the
    moment the cutoff passes, the same data reads as the new status.
    """

    NOT_INVITED = "not_invited"
    INVITE_SENT = "invite_sent"
    JOINED = "joined"
    FOLLOW_UP_REQUIRED = "follow_up_required"


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
    # Roster locked by an HR Coordinator: every allocated lead has become a
    # Student and no further allocations are accepted. Sits between UPCOMING
    # and ONGOING, which still means "currently running".
    CONFIRMED = "confirmed"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AllocationStatus(StrEnum):
    """State of one lead's seat in a batch, before and after confirmation."""

    ALLOCATED = "allocated"
    CONFIRMED = "confirmed"
    WITHDRAWN = "withdrawn"


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


class NotificationCategory(StrEnum):
    """Why a notification was raised, which decides what opening it does.

    Opening a Finance payment reminder deliberately drags its lead back to the
    follow-up stage, because the point of that reminder is that someone has to
    chase the money again. The date-driven reminders must not: a lead whose
    follow-up call or installment simply came due is already where it belongs,
    and silently moving it backwards would rewrite the pipeline behind the
    admin's back every time they read their notifications.
    """

    PAYMENT_REMINDER = "payment_reminder"
    FOLLOW_UP_DUE = "follow_up_due"
    INSTALLMENT_DUE = "installment_due"
    # Finance declaring a lead a non-payer. Addressed to the HR Coordinators
    # rather than a section admin, because the action it asks for is theirs:
    # take the student out of the batch group.
    NON_PAYMENT = "non_payment"


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
