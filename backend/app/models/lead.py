"""Lead document — a prospective student tracked through the CRM / Pre-Sales pipeline."""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from pymongo import IndexModel
from pydantic import BaseModel, Field

from app.database.base import BaseDocument, utcnow
from app.database.types import MongoDecimal
from app.models.enums import (
    InstallmentPaymentMode,
    LeadSource,
    LeadStatus,
    PaymentMethod,
    PaymentOption,
    PaymentPlanOption,
    WhatsAppGroupStatus,
)
from app.models.foundation_group import FoundationGroupMove

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


class RemarkEntry(BaseModel):
    """One dated staff note on a lead.

    Remarks are a diary, not a field. The same lead is called on many days and
    each call's outcome belongs to the day it happened - a single text box
    meant every new note either overwrote the last one or grew into an undated
    wall of text nobody could read a history out of.

    `remark_date` is the day the note is *about*, which is not always the day
    it was typed: notes get written up the morning after the call, and a plan
    for next Tuesday is entered today. It is therefore free to be back- or
    future-dated, exactly like a calendar entry, while `created_at` keeps the
    record of when it was actually saved.
    """

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    remark_date: date
    text: str = Field(max_length=2000)
    created_at: datetime = Field(default_factory=utcnow)
    created_by: uuid.UUID | None = None
    # The author's name snapshotted at write time rather than looked up per
    # entry. The board renders a page of leads at once, each carrying its whole
    # remark history - resolving authors on read would turn one list request
    # into hundreds of user fetches. A staffer who is later renamed keeps the
    # name they had when they wrote it, which is what a log should say anyway.
    created_by_name: str | None = Field(default=None, max_length=150)
    updated_at: datetime | None = None


class PaymentInstallment(BaseModel):
    """One payment in a Foundation Form lead's plan (1 for single shot, 2 for
    two shot, 6 for EMI). Pre-populated with label/amount from the pricing
    table at submission time; staff fill in the rest as each is collected."""

    label: str
    # The fee this installment is for, priced from the program.
    amount: MongoDecimal | None = None
    # What was actually collected, keyed in by hand. Can fall short of
    # `amount` - a student on single shot who pays part now and the rest in a
    # couple of days - and the shortfall stays due until `scheduled_at`.
    # None on installments saved before this existed: those were paid in full.
    received_amount: MongoDecimal | None = None
    mode: InstallmentPaymentMode | None = None
    # Which QR code / account this payment went into. Lead.qr_code mirrors the
    # latest one, which is what the board filters on.
    qr_code: str | None = Field(default=None, max_length=100)
    transaction_id: str | None = Field(default=None, max_length=100)
    upi_id: str | None = Field(default=None, max_length=100)
    # The first proof, kept for the readers that only ever show one (Payments,
    # Cashbook). `proof_urls` is the whole set; LeadService keeps the two in
    # step. Installments saved before multi-proof have only `proof_url`.
    proof_url: str | None = Field(default=None, max_length=500)
    proof_urls: list[str] = Field(default_factory=list)
    # Optional note from whoever collected the payment.
    remarks: str | None = Field(default=None, max_length=1000)
    # Two-shot's 2nd installment starts as just a planned date before it's
    # actually paid.
    scheduled_at: date | None = None
    paid: bool = False
    # Set once, the moment `paid` first flips to True - LeadService.update_installment.
    paid_at: date | None = None

    def all_proofs(self) -> list[str]:
        """Every proof on file, including the lone `proof_url` of an
        installment saved before there could be several."""
        return list(self.proof_urls) or ([self.proof_url] if self.proof_url else [])

    def collected(self) -> Decimal:
        """Money actually received against this installment: the full fee
        once paid, or the part-payment on record (mode and proof) before that."""
        if self.paid:
            return Decimal(self.received_amount if self.received_amount is not None else self.amount or 0)
        if self.received_amount and self.mode and self.all_proofs():
            return Decimal(self.received_amount)
        return Decimal(0)


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
    #
    # Superseded by `remark_entries` as the thing staff write into, and kept as
    # a mirror of the most recent entry's text: every remark mutation rewrites
    # it. That keeps one-line consumers (the row tooltip, exports, anything
    # reading a lead document directly) working unchanged, and it is still the
    # only home for notes written before dated remarks existed - which is why
    # nothing clears it.
    remarks: str | None = Field(default=None, max_length=2000)
    # The dated notes themselves, newest first (see LeadService._sort_remarks).
    # Embedded on the lead rather than given their own collection: they are
    # only ever read with the lead they belong to, and the board needs a page
    # of leads' histories from the one query it already makes.
    remark_entries: list[RemarkEntry] = Field(default_factory=list)
    # Manually-tracked pricing tier + call disposition, set by whoever is
    # working the lead's payment on the phone - independent of payment_plan/
    # installments (the structured Foundation Form payment-collection flow).
    payment_option: PaymentOption | None = None
    # Free text: the PaymentCallRemark values are the built-in menu, and the
    # board can add a remark of its own the menu doesn't have.
    payment_call_remarks: str | None = None
    # What the candidate actually paid, typed in by whoever took the payment.
    # Deliberately not derived from the installments: this is the manual
    # tracking pair above, used while a lead is still being chased on the
    # phone and before any structured collection has happened.
    paying_amount: MongoDecimal | None = None
    # Which QR code / account the money came through. Free text rather than an
    # enum: the list is a roster of people and accounts that changes without a
    # deploy, and an enum would reject a value the moment somebody is added.
    qr_code: str | None = Field(default=None, max_length=100)
    # Ticked by an HR Coordinator to record that they've dealt with this lead
    # in the batch queue. Purely their own working marker - it doesn't move the
    # lead's stage or affect allocation.
    hr_marked: bool = Field(default=False)
    hr_marked_at: datetime | None = None
    # The batch the coordinator writes in by hand (e.g. "27") - free text, and
    # separate from `batch_preference` (what the student asked for on the form)
    # and from the Batch documents the allocation flow uses.
    batch_number: str | None = Field(default=None, max_length=50)
    # Which foundation class group this student sits in. Inherited from the
    # induction entry when the two are matched, since that is where it was
    # asked for, and editable on the Foundation board afterwards.
    #
    # Not to be confused with `group_assigned_at` just below, which is about a
    # WhatsApp group and has nothing to do with this one. See
    # app/utils/foundation_groups.py.
    foundation_group: int | None = None
    # Every move between groups, oldest first, so the board can say a student
    # was moved rather than only where they now are.
    foundation_group_history: list[FoundationGroupMove] = Field(default_factory=list)
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
    # Set when Finance declares the student a non-payer. Kept on the lead as
    # well as sent as a notification, so the HR board can flag the row for
    # anyone who wasn't the one to read the message - a notification is seen
    # once by one person, and this has to survive that.
    non_payment_reported_at: datetime | None = None
    non_payment_amount: MongoDecimal | None = None
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
            # Filterable on the Foundation board, and the roll for one group is
            # a question this collection is asked constantly.
            IndexModel([("foundation_group", 1)]),
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
