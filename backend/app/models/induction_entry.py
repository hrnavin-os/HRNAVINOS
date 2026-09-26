"""InductionEntry document — one row of the Induction Call Form.

Batch is typed on the form as a bare number and stored as `batch_number`;
"Batch-20" is how it is shown (see batch_label), never how it is stored.
"""
import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field
from pymongo import IndexModel

from app.database.base import BaseDocument
from app.models.enums import InductionStatus
from app.models.foundation_group import FoundationGroupMove


# The four pages of the post-call update form. Grouped rather than flattened
# onto the document so a page maps to one object: the form fills them in order,
# and every one is optional because the call may not have happened yet.
class InductionQualification(BaseModel):
    ug_degree: str | None = Field(default=None, max_length=150)
    ug_passed_out_year: str | None = Field(default=None, max_length=10)
    pg_degree: str | None = Field(default=None, max_length=150)
    pg_passed_out_year: str | None = Field(default=None, max_length=10)


class InductionPlacement(BaseModel):
    work_experience: str | None = Field(default=None, max_length=500)
    training_or_extra_course: str | None = Field(default=None, max_length=500)
    current_location: str | None = Field(default=None, max_length=200)
    preferred_location: str | None = Field(default=None, max_length=200)


class InductionRemarks(BaseModel):
    session_preference: str | None = Field(default=None, max_length=50)  # Live | Recorded
    requirements: str | None = Field(default=None, max_length=1000)
    details: str | None = Field(default=None, max_length=1000)
    doubts_clarified: str | None = Field(default=None, max_length=1000)


class InductionOtherDetails(BaseModel):
    induction_call_date: date | None = None
    scheduled_time: str | None = Field(default=None, max_length=20)
    # Whether this candidate has signed the Terms & Conditions. Asked on the
    # fourth page of the update form since before the Terms register existed,
    # and left here rather than moved onto a field of its own: two places
    # storing "has signed" is two places to disagree, and the update form is
    # where the caller who took the signature already is.
    terms_form_signed: bool | None = None
    # Who recorded the signature and when. Beside the flag rather than in an
    # audit log, because the register has to print them next to the name -
    # "signed" with nobody attached is a claim, not a record. Both paths that
    # can flip the flag stamp these (see InductionEntryService.stamp_terms).
    terms_signed_at: datetime | None = None
    terms_signed_by: uuid.UUID | None = None
    # The marker's name snapshotted at write time, so the register renders a
    # page of rows without a user lookup per row.
    terms_signed_by_name: str | None = Field(default=None, max_length=150)
    whatsapp_group_added: bool | None = None
    # Path returned by the upload endpoint, not the file itself.
    call_recording_url: str | None = Field(default=None, max_length=500)
    confidence: str | None = Field(default=None, max_length=50)


class AttendanceMark(BaseModel):
    """One yes/no marker on a student, with who set it and when.

    `marked` is deliberately three-valued. None is "nobody has said" - which is
    not the same as "no", and matters for the markers that have an automatic
    answer to fall back on: a coordinator's explicit False has to be able to
    override what the data would otherwise imply, and it cannot if False is
    also the empty state.
    """

    marked: bool | None = None
    at: datetime | None = None
    by: uuid.UUID | None = None
    # The marker's name snapshotted at write time, so a page of rows renders
    # without a user lookup each.
    by_name: str | None = Field(default=None, max_length=150)


class FollowUpRemark(BaseModel):
    """One follow-up call on a student who hasn't done something yet - why
    they said they didn't select the poll, typed by the section admin who
    rang them. Kept as a history rather than one overwritten note: a second
    call a week later is a second answer, and the first still matters."""

    remark: str = Field(max_length=1000)
    at: datetime
    by: uuid.UUID | None = None
    # Snapshotted like AttendanceMark.by_name, so a page of rows renders
    # without a user lookup each.
    by_name: str | None = Field(default=None, max_length=150)


class InductionAttendance(BaseModel):
    """The induction programme's attendance markers, other than the terms
    signature - which predates this and stays where the update form's fourth
    page has always written it (other_details.terms_form_signed).

    One object rather than six loose fields so a marker added later is one
    entry here, and so the whole set can be read in a single attribute.
    """

    polls_selected: AttendanceMark = Field(default_factory=AttendanceMark)
    # Why a student didn't select the poll, one entry per follow-up call, oldest
    # first. Written by the section admins from their Polls menu.
    polls_follow_ups: list[FollowUpRemark] = Field(default_factory=list)
    success_meet_attended: AttendanceMark = Field(default_factory=AttendanceMark)
    # Has an automatic answer as well as a manual one: an entry linked to a
    # Foundation Form submission attended the foundation class by definition.
    # See the marker registry in attendance_service.
    foundation_class_attended: AttendanceMark = Field(default_factory=AttendanceMark)


def batch_label(number: int | None) -> str | None:
    """"Batch-20" for a stored 20, or None when no batch was entered."""
    return f"Batch-{number}" if number is not None else None


def parse_batch(value: str | int | None) -> int | None:
    """The number behind a batch as a filter sends it: 20, "20" or "Batch-20".
    None for anything else, so a junk query param narrows nothing rather than
    failing."""
    if value is None:
        return None
    match = re.fullmatch(r"\s*(?:batch\s*-?\s*)?(\d{1,6})\s*", str(value), re.IGNORECASE)
    return int(match.group(1)) if match else None


def lead_batch_label(induction_number: int | None, typed: str | None) -> str | None:
    """The one batch a lead is shown in, everywhere.

    The number entered on the Induction form wins for any lead that came
    through Induction - it is the single source, so the boards can't disagree.
    Only a lead with no induction batch falls back to what was typed on the
    lead itself, shown as "Batch-N" when it is a number.
    """
    if induction_number is not None:
        return batch_label(induction_number)
    if not typed or not typed.strip():
        return None
    number = parse_batch(typed)
    return batch_label(number) if number is not None else typed.strip()


def is_quit_remark(remark: str | None) -> bool:
    """Whether a call remark says this candidate has quit.

    Matched on the word rather than against a list of the exact options: every
    quit disposition contains "quit" and no other one does, and the options
    themselves live in the frontend because they are operational and get added
    to. Mirrors QUIT_REMARK in the repository, which asks the same question of
    the database - so an entry cannot count as quit in one place and not the
    other.
    """
    return bool(remark) and "quit" in remark.lower()


class InductionEntry(BaseDocument):
    name: str = Field(max_length=150)
    email: str | None = Field(default=None, max_length=255)
    phone: str = Field(max_length=20)
    # `phone` as the student gave it, kept verbatim for display and dialling;
    # this is the comparable form the Foundation Form matches against. Stored
    # rather than computed per query so the match is a single indexed lookup
    # instead of a collection scan - see app/utils/phone.py.
    phone_normalized: str | None = Field(default=None, max_length=20)
    registration_date: date
    paid_date: date | None = None
    # Open-ended on purpose: each of these is a dropdown in the UI that also
    # accepts a typed value, so a closed enum would reject exactly the custom
    # entries the form is meant to allow.
    sales_person: str | None = Field(default=None, max_length=100)
    lead_source: str | None = Field(default=None, max_length=150)
    payment_mode: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=150)
    # The batch the student joins, entered on the form as just the number (20)
    # and shown everywhere as "Batch-20". Stored rather than read off the
    # registration month, which is what it used to be: the batch is decided by
    # the team, not by the calendar. None on rows keyed in before the field.
    batch_number: int | None = None
    # Where this candidate stands after the induction call - set from a
    # dropdown on the board. Open text rather than an enum for the same reason
    # the fields above are: the list is long, entirely operational, and gets
    # added to, and a closed enum would need a deploy every time a new
    # disposition is wanted. The options live in the frontend constants.
    call_remark: str | None = Field(default=None, max_length=100)
    # Why they quit, in the caller's own words. Required whenever the remark
    # says quit and cleared the moment it stops saying so - a reason with no
    # quit behind it is a sentence about nothing, so the two are written
    # together (see InductionEntryService.update). Longer than the remark it
    # explains because this one is prose, not a disposition off a list.
    quit_reason: str | None = Field(default=None, max_length=500)

    # Which foundation class group this student sits in. Asked for on the
    # form as `group` and stored under the longer name the boards already use
    # for it, so it can't be confused with the WhatsApp group on Lead.
    #
    # Stored rather than read off the registration date, which is what it used
    # to be: there are three groups and students move between them, and a date
    # can express neither. See app/utils/foundation_groups.py.
    foundation_group: int | None = None
    # Every time that number changed, oldest first. The board prints the last
    # one beside the group - a student moved to Group 2 mid-course has to say
    # so, or the roll the coordinator printed on Monday is quietly wrong.
    foundation_group_history: list[FoundationGroupMove] = Field(default_factory=list)

    # Set once, on create, by the round-robin in InductionEntryService. Both
    # are stored rather than derived: who owns a row must not change when
    # someone is added to or removed from the Section Admin rota afterwards.
    assigned_to: uuid.UUID | None = None
    section: str | None = Field(default=None, max_length=50)

    # Filled in after the induction call, through the multi-page update form.
    # Default to empty objects rather than None so existing rows read back
    # without a migration and the UI never has to null-check a whole group.
    qualification: InductionQualification = Field(default_factory=InductionQualification)
    placement: InductionPlacement = Field(default_factory=InductionPlacement)
    remarks: InductionRemarks = Field(default_factory=InductionRemarks)
    other_details: InductionOtherDetails = Field(default_factory=InductionOtherDetails)
    # The attendance board's markers. Defaults to an empty set, so every row
    # that predates the board reads back as "nobody has said" rather than
    # needing a migration.
    attendance: InductionAttendance = Field(default_factory=InductionAttendance)

    # Set when this person later submits the Foundation Form with a matching
    # mobile number. The entry itself is never deleted or emptied - the whole
    # point of linking is that the induction data survives the move - but a
    # linked entry drops off the active Induction board, because it has moved
    # on to Foundation and showing it in both lists would double-count it.
    foundation_lead_id: uuid.UUID | None = None
    converted_at: datetime | None = None

    class Settings:
        name = "induction_entries"
        indexes = [
            IndexModel([("registration_date", -1)]),
            IndexModel([("phone", 1)]),
            IndexModel([("assigned_to", 1)]),
            # The group column is filterable on three boards, and the roll for
            # one group is the commonest thing anybody asks this collection.
            IndexModel([("foundation_group", 1)]),
            # The Batch filter on the Induction and Attendance boards.
            IndexModel([("batch_number", 1)]),
            # The matching lookup: by number, restricted to entries that have
            # not already been converted. Compound because every caller asks
            # both questions at once.
            IndexModel([("phone_normalized", 1), ("foundation_lead_id", 1)]),
        ]

    @property
    def status(self) -> InductionStatus:
        """Which of the board's three buckets this entry belongs to.

        A pure read of the call remark and foundation_lead_id, which the
        mobile-number match sets - so the status can never disagree with them,
        and nothing has to remember to update it.

        Quit is checked first, matching the query in the repository: somebody
        who has quit is not still in Induction, whatever else is true of them.
        """
        if is_quit_remark(self.call_remark):
            return InductionStatus.QUIT
        return (
            InductionStatus.MOVED_TO_FOUNDATION
            if self.foundation_lead_id is not None
            else InductionStatus.PENDING_INDUCTION
        )

    def __repr__(self) -> str:
        return f"<InductionEntry {self.name} {self.registration_date}>"
