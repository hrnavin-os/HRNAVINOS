"""Lead document — a prospective student tracked through the CRM / Pre-Sales pipeline."""
import uuid
from datetime import date, datetime, timedelta

from pymongo import IndexModel
from pydantic import BaseModel, Field

from app.database.base import BaseDocument, utcnow
from app.database.types import MongoDecimal
from app.models.enums import (
    InstallmentPaymentMode,
    LeadSource,
    LeadStatus,
    PaymentCallRemark,
    PaymentMethod,
    PaymentOption,
    PaymentPlanOption,
    WhatsAppGroupStatus,
)

# How long a candidate has to accept a group invite before the board starts
# asking somebody to chase them. One working day: long enough that a candidate
# who was simply asleep isn't flagged, short enough that a batch filling up
# doesn't wait a week to find out who never joined.
#
# The single place this is configured. It is read at query time as well as on
# the model, so changing it here re-classifies everyone immediately - there is
# no stored status to migrate.
INVITE_WAIT = timedelta(hours=24)


class FollowUpEntry(BaseModel):
    scheduled_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    created_by: uuid.UUID | None = None


class PaymentInstallment(BaseModel):
    """One payment in a Foundation Form lead's plan (1 for single shot, 2 for
    two shot, 6 for EMI). Pre-populated with label/amount from the pricing
    table at submission time; staff fill in the rest as each is collected."""

    label: str
    amount: MongoDecimal | None = None
    mode: InstallmentPaymentMode | None = None
    transaction_id: str | None = Field(default=None, max_length=100)
    upi_id: str | None = Field(default=None, max_length=100)
    proof_url: str | None = Field(default=None, max_length=500)
    # Two-shot's 2nd installment starts as just a planned date before it's
    # actually paid.
    scheduled_at: date | None = None
    paid: bool = False
    # Set once, the moment `paid` first flips to True - LeadService.update_installment.
    paid_at: date | None = None


class Lead(BaseDocument):
    name: str = Field(max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(max_length=20)
    # The comparable form of `phone` - see app/utils/phone.py. Both the
    # Induction match and the duplicate-submission check key off this, so it is
    # stored and indexed rather than derived per query.
    phone_normalized: str | None = Field(default=None, max_length=20)
    # The Induction Call Form entry this lead came from, matched on mobile
    # number when the Foundation Form was submitted. None means the number
    # never appeared in Induction - an "unmatched" Foundation lead, which is a
    # legitimate state, not an error. The induction record is referenced rather
    # than copied so the full history stays traceable in one direction and the
    # induction data has exactly one home.
    induction_entry_id: uuid.UUID | None = None
    source: LeadSource = LeadSource.OTHER
    status: LeadStatus = LeadStatus.NEW_LEAD
    course_interest: str | None = Field(default=None, max_length=150)
    batch_preference: str | None = Field(default=None, max_length=150)
    payment_expected: str | None = Field(default=None, max_length=150)
    notes: str | None = None
    assigned_to: uuid.UUID | None = None
    follow_up_at: datetime | None = None
    follow_up_history: list[FollowUpEntry] = Field(default_factory=list)
    # Pre Screening stage: payment proof captured before moving further down the pipeline.
    payment_image_url: str | None = Field(default=None, max_length=500)
    paid_amount: MongoDecimal | None = None
    payment_mode: PaymentMethod | None = None
    # Set for leads imported via an integration (e.g. Google Sheets) so re-syncs
    # can skip rows already imported. Format: "gsheet:{spreadsheet_id}:{tab}:{row}".
    external_ref: str | None = Field(default=None, max_length=255)
    # False for leads imported via an integration until a Pre Sales staffer checks
    # them on the Form Check page; leads created directly in the CRM need no review.
    reviewed: bool = Field(default=True)
    # Full question->answer snapshot of the source row (e.g. every Google Form
    # column), so Form Check can show fields beyond name/phone/email.
    raw_form_data: dict[str, str] | None = Field(default=None)
    # Set for Foundation Form submissions; drives the plan-specific payment
    # collection UI (installments) instead of the generic single-amount one.
    # An open-ended Program.value, not a closed enum: admins add and retire
    # programs at runtime from Admin > Programs, exactly as `section` above is
    # open-ended. Validated against the programs collection in the services.
    program_interest: str | None = None
    payment_plan: PaymentPlanOption | None = None
    installments: list[PaymentInstallment] = Field(default_factory=list)
    # Which Form Collection section this lead came through, if any - an
    # open-ended code (not a closed enum; admins can add new sections at any
    # time, see FormCollectionSectionCfg). None covers every pre-existing
    # lead and submissions through the legacy, section-less public form link.
    section: str | None = None
    # Free-form internal staff notes - distinct from `notes` (the student's
    # own submitted query/doubts text from the public form).
    remarks: str | None = Field(default=None, max_length=2000)
    # Manually-tracked pricing tier + call disposition, set by whoever is
    # working the lead's payment on the phone - independent of payment_plan/
    # installments (the structured Foundation Form payment-collection flow).
    payment_option: PaymentOption | None = None
    payment_call_remarks: PaymentCallRemark | None = None
    # Ticked by an HR Coordinator to record that they've dealt with this lead
    # in the batch queue. Purely their own working marker - it doesn't move the
    # lead's stage or affect allocation.
    hr_marked: bool = Field(default=False)
    hr_marked_at: datetime | None = None
    # The batch the coordinator writes in by hand (e.g. "27") - free text, and
    # separate from `batch_preference` (what the student asked for on the form)
    # and from the Batch documents the allocation flow uses.
    batch_number: str | None = Field(default=None, max_length=50)
    # When the candidate actually joined their section's WhatsApp group. Named
    # for the queue it used to drive rather than for what it means; kept under
    # that name because every existing row already carries it, and exposed as
    # `joined_at` on the API.
    group_assigned_at: datetime | None = None
    # When the invite was last sent, and how many times. An invite is NOT a
    # join: the two were the same click until this existed, so a candidate who
    # was merely messaged counted as a group member and nobody chased them.
    whatsapp_invite_sent_at: datetime | None = None
    whatsapp_invite_count: int = 0
    # Set when a coordinator records that they chased an unjoined candidate.
    # Doesn't change the status - the candidate still hasn't joined - it only
    # says somebody has already tried, so two coordinators don't both ring the
    # same person on the same day.
    whatsapp_last_follow_up_at: datetime | None = None
    # The coordinator who last acted on this candidate's group onboarding.
    # Ownership follows whoever picked it up rather than being assigned in
    # advance, since the queue is worked from the top by whoever is free.
    whatsapp_handled_by: uuid.UUID | None = None
    # Captured at the moment a lead is moved to Lost, so the Lost list can say
    # why rather than just that it happened.
    lost_reason: str | None = Field(default=None, max_length=500)
    lost_at: datetime | None = None

    class Settings:
        name = "leads"
        indexes = [
            IndexModel([("email", 1)]),
            IndexModel([("phone", 1)]),
            # Not unique, for the same reason external_ref below isn't: leads
            # predating this field all carry `null`, and staff-created leads
            # can legitimately share a number with a form submission. Duplicate
            # prevention is enforced in FoundationFormService.submit instead.
            IndexModel([("phone_normalized", 1)]),
            IndexModel([("induction_entry_id", 1)]),
            IndexModel([("status", 1)]),
            IndexModel([("assigned_to", 1)]),
            IndexModel([("section", 1)]),
            # The reminder sweep runs on every notification poll, so the "whose
            # follow-up is due" query has to be an index hit rather than a scan
            # of every lead in the system.
            IndexModel([("follow_up_at", 1)]),
            # Not unique: MongoDB stores this as `null` (not "missing") on every
            # regular lead, since Beanie always writes declared fields, so a
            # unique+sparse index would collide across all non-synced leads.
            # Dedup for Google Sheets sync is already enforced in application
            # code (GoogleSheetsService.sync_all checks for an existing match).
            IndexModel([("external_ref", 1)]),
        ]

    @property
    def whatsapp_status(self) -> WhatsAppGroupStatus:
        """Where this candidate is in the group onboarding.

        Derived, never stored. Follow-up Required is "invited a while ago and
        still not in" - a fact about the clock, not an event anybody records -
        so computing it means it arrives exactly when the wait elapses instead
        of whenever a job last ran, and it can never disagree with the
        timestamps it's read from.
        """
        if self.group_assigned_at is not None:
            return WhatsAppGroupStatus.JOINED
        if self.whatsapp_invite_sent_at is None:
            return WhatsAppGroupStatus.NOT_INVITED
        if utcnow() - self.whatsapp_invite_sent_at >= INVITE_WAIT:
            return WhatsAppGroupStatus.FOLLOW_UP_REQUIRED
        return WhatsAppGroupStatus.INVITE_SENT

    def __repr__(self) -> str:
        return f"<Lead {self.name} status={self.status}>"
