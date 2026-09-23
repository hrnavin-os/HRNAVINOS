"""What the two synced tabs contain, and how a sheet edit becomes an ERP edit.

One spec per tab. A spec knows its columns, how to render a record into cell
text, and how to save an edited cell back. Saving always goes through the same
service methods the Lead Dashboard calls, so a sheet edit is held to exactly
the rules a click on the board is - a stage can't skip Financial Approval from
the sheet any more than it can from the Stage dropdown.

The generic three-way merge that decides *which* cells were edited lives in
lead_sheet_sync_service; nothing here knows about snapshots.
"""
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pydantic import ValidationError

from app.database.base import utcnow
from app.exceptions.base import AppException
from app.models.enums import InductionStatus, LeadSource, LeadStatus, PaymentCallRemark, PaymentPlanOption
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
from app.models.user import User
from app.repositories.foundation_form_config_repository import FoundationFormConfigRepository
from app.schemas.induction_entry_schema import InductionDetailsUpdate, InductionEntryCreate, InductionEntryUpdate
from app.schemas.lead_schema import LeadCreate, LeadPlanAssign, LeadRemarkCreate, LeadUpdate
from app.services.induction_entry_service import InductionEntryService, batch_for
from app.services.lead_service import LeadService
from app.utils.foundation_groups import foundation_group_label, parse_foundation_group


@dataclass(frozen=True)
class Column:
    key: str
    header: str
    # Read-only columns are recomputed from the ERP every run; typing over one
    # is undone rather than saved.
    editable: bool = True
    # Only read when the sync is adding a new row to the ERP - e.g. the section
    # an induction entry is filed under, which the board never changes after.
    create_only: bool = False


# ---------------------------------------------------------------------------
# Cell text in and out
# ---------------------------------------------------------------------------


def cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value)


def optional(raw: str) -> str | None:
    return raw.strip() or None


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d-%b-%Y", "%d %B %Y", "%d/%m/%y")


def parse_date(raw: str) -> date | None:
    text = raw.strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f'"{text}" is not a date - write it as YYYY-MM-DD or DD/MM/YYYY')


def parse_bool(raw: str) -> bool | None:
    text = raw.strip().lower()
    if not text:
        return None
    if text in {"yes", "y", "true", "1", "done", "signed", "added"}:
        return True
    if text in {"no", "n", "false", "0"}:
        return False
    raise ValueError(f'"{raw.strip()}" should be Yes or No')


def parse_amount(raw: str) -> Decimal | None:
    text = re.sub(r"(?i)rs\.?|inr|₹|,|\s", "", raw)
    if not text:
        return None
    try:
        amount = Decimal(text)
    except InvalidOperation:
        raise ValueError(f'"{raw.strip()}" is not an amount') from None
    if amount < 0:
        raise ValueError("an amount can't be negative")
    return amount


def _squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def parse_choice(raw: str, labels: dict[str, str]) -> str | None:
    """The stored value for a label (or the value itself) typed in a cell."""
    text = raw.strip()
    if not text:
        return None
    wanted = _squash(text)
    for value, label in labels.items():
        if wanted in {_squash(value), _squash(label)}:
            return value
    raise ValueError(f'"{text}" isn\'t one of: {", ".join(labels.values())}')


def error_message(exc: Exception) -> str:
    if isinstance(exc, AppException):
        return exc.message
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        return first.get("msg", "invalid value").removeprefix("Value error, ")
    return str(exc) or exc.__class__.__name__


# Same wording as the board (frontend/src/constants), so a value reads the same
# in both places and can be typed back exactly as it is shown.
LEAD_STAGE_LABELS = {
    LeadStatus.NEW_LEAD: "New Lead",
    LeadStatus.RNR: "RNR",
    LeadStatus.PRE_SCREENING: "Follow up call",
    LeadStatus.FINANCIAL_APPROVAL: "Financial Approval",
    LeadStatus.BATCH_CONFIRMATION: "Batch Confirmation",
    LeadStatus.LOST: "Lost",
}
PAYMENT_REMARK_LABELS = {
    PaymentCallRemark.CONFIRMED_TO_PAY: "Confirmed to pay",
    PaymentCallRemark.WILL_PAY_PENDING: "Will Pay-Pending",
    PaymentCallRemark.DNP: "DNP",
    PaymentCallRemark.CALL_BACK: "Call Back",
    PaymentCallRemark.NEED_TO_DISCUSS: "Need to discuss",
    PaymentCallRemark.QUIT: "Quit",
    PaymentCallRemark.ONBOARDED: "Onboarded",
}
PAYMENT_PLAN_LABELS = {
    PaymentPlanOption.SINGLE_SHOT: "Single shot",
    PaymentPlanOption.TWO_SHOT: "Two shot payment",
    PaymentPlanOption.EMI_6_WEEKS: "EMI - 6 Weeks",
}
INDUCTION_STATUS_LABELS = {
    InductionStatus.PENDING_INDUCTION: "Induction Leads",
    InductionStatus.MOVED_TO_FOUNDATION: "Moved to Foundation",
    InductionStatus.QUIT: "Quit",
}


class SheetTabSpec:
    key: str
    columns: list[Column]
    # Column key holding the mobile number, used to link a pasted row that has
    # no ERP ID to the record it already describes instead of duplicating it.
    phone_column: str = "phone"
    required_on_create: tuple[str, ...] = ()
    # Set by for_section(): the tab then holds only that section's records
    # (None = the ones filed under no section). Unset, it holds all of them.
    scoped: bool = False
    section: str | None = None

    def for_section(self, code: str | None) -> "SheetTabSpec":
        """This spec narrowed to one section, keyed apart so each section tab
        keeps its own row snapshots."""
        self.scoped = True
        self.section = code
        self.key = f"{self.key}:{code or '-'}"
        return self

    def scope(self, query: dict) -> dict:
        return {**query, "section": self.section} if self.scoped else query

    def default_section(self, raw: str) -> str | None:
        """The section a new row is filed under: what its Section cell says,
        else the section of the tab it was typed into."""
        return optional(raw) or (self.section_label(self.section) if self.scoped and self.section else None)

    async def prepare(self) -> None:
        """Loads the lookups rendering needs (names, section labels) once per run."""
        config = await FoundationFormConfigRepository().get_or_create()
        self.section_labels = {section.code: section.label for section in config.sections}
        users = await User.find({}).to_list()
        self.user_names = {user.id: f"{user.first_name} {user.last_name}".strip() for user in users}

    def column(self, key: str) -> Column:
        return next(column for column in self.columns if column.key == key)

    def section_label(self, code: str | None) -> str:
        return self.section_labels.get(code, code) if code else ""

    def assignee(self, user_id: uuid.UUID | None) -> str:
        return self.user_names.get(user_id, "") if user_id else ""

    async def load_records(self) -> list:
        raise NotImplementedError

    def values(self, record) -> dict[str, str]:
        raise NotImplementedError

    async def apply(self, record, edits: dict[str, str], row: dict[str, str]) -> list[str]:
        """Saves each edited cell; returns a message per cell that was refused."""
        raise NotImplementedError

    async def create(self, row: dict[str, str]) -> tuple[object, list[str]]:
        raise NotImplementedError

    def _check_required(self, row: dict[str, str]) -> None:
        missing = [self.column(key).header for key in self.required_on_create if not row.get(key, "").strip()]
        if missing:
            raise ValueError(f"{' and '.join(missing)} {'is' if len(missing) == 1 else 'are'} required")


# ---------------------------------------------------------------------------
# Induction tab <- InductionEntry (every live entry, all three board tabs)
# ---------------------------------------------------------------------------

_DETAIL_GROUPS = {
    "qualification": ("ug_degree", "ug_passed_out_year", "pg_degree", "pg_passed_out_year"),
    "placement": ("work_experience", "training_or_extra_course", "current_location", "preferred_location"),
    "remarks": ("session_preference", "requirements", "details", "doubts_clarified"),
    "other_details": (
        "induction_call_date",
        "scheduled_time",
        "confidence",
        "terms_form_signed",
        "whatsapp_group_added",
    ),
}
_GROUP_OF = {field: group for group, fields in _DETAIL_GROUPS.items() for field in fields}
_INDUCTION_TOP_FIELDS = (
    "name",
    "phone",
    "email",
    "registration_date",
    "paid_date",
    "sales_person",
    "lead_source",
    "payment_mode",
    "category",
    "call_remark",
    "quit_reason",
)
# The remark and the reason behind it are one change, not two: the service
# refuses a quit remark with no reason against it, so sending the pair as
# separate updates would be turned down on whichever arrived first.
_INDUCTION_PAIRED = ("call_remark", "quit_reason")
_DATE_FIELDS = {"registration_date", "paid_date", "induction_call_date"}
_BOOL_FIELDS = {"terms_form_signed", "whatsapp_group_added"}
_NOT_BLANK = {"name", "phone", "registration_date"}


class InductionTab(SheetTabSpec):
    key = "induction"
    required_on_create = ("name", "phone")
    columns = [
        Column("name", "Name"),
        Column("phone", "Mobile Number"),
        Column("email", "Email"),
        Column("registration_date", "Registration Date"),
        Column("paid_date", "Paid Date"),
        Column("batch", "Batch", editable=False),
        Column("section", "Section", create_only=True),
        Column("group", "Group"),
        Column("assigned_to", "Assigned To", editable=False),
        Column("sales_person", "Sales Person"),
        Column("lead_source", "Lead Source"),
        Column("payment_mode", "Payment Mode"),
        Column("category", "Category"),
        Column("call_remark", "Induction Call Remarks"),
        Column("quit_reason", "Quit Reason"),
        Column("status", "Status", editable=False),
        Column("induction_call_date", "Induction Call Date"),
        Column("scheduled_time", "Scheduled Time"),
        Column("session_preference", "Session Preference"),
        Column("requirements", "Requirements"),
        Column("details", "Details"),
        Column("doubts_clarified", "Doubts Clarified"),
        Column("ug_degree", "UG Degree"),
        Column("ug_passed_out_year", "UG Passed Out Year"),
        Column("pg_degree", "PG Degree"),
        Column("pg_passed_out_year", "PG Passed Out Year"),
        Column("work_experience", "Work Experience"),
        Column("training_or_extra_course", "Training / Extra Course"),
        Column("current_location", "Current Location"),
        Column("preferred_location", "Preferred Location"),
        Column("confidence", "Confidence"),
        Column("terms_form_signed", "Terms Signed"),
        Column("whatsapp_group_added", "WhatsApp Group Added"),
        Column("created_at", "Created On", editable=False),
    ]

    def __init__(self) -> None:
        self.service = InductionEntryService()

    async def load_records(self) -> list[InductionEntry]:
        return await InductionEntry.find(self.scope({"is_deleted": False})).sort("+created_at").to_list()

    def values(self, entry: InductionEntry) -> dict[str, str]:
        values = {field: cell_text(getattr(entry, field)) for field in _INDUCTION_TOP_FIELDS}
        for field, group in _GROUP_OF.items():
            values[field] = cell_text(getattr(getattr(entry, group), field))
        values.update(
            batch=batch_for(entry.registration_date),
            section=self.section_label(entry.section),
            group=foundation_group_label(entry.foundation_group),
            assigned_to=self.assignee(entry.assigned_to),
            status=INDUCTION_STATUS_LABELS[entry.status],
            created_at=cell_text(entry.created_at),
        )
        return values

    @staticmethod
    def _parse(field: str, raw: str):
        if field in _DATE_FIELDS:
            return parse_date(raw)
        if field in _BOOL_FIELDS:
            return parse_bool(raw)
        return optional(raw)

    async def apply(self, entry: InductionEntry, edits: dict[str, str], row: dict[str, str]) -> list[str]:
        errors = []
        paired = {field: edits[field] for field in _INDUCTION_PAIRED if field in edits}
        for field, raw in edits.items():
            if field in paired:
                continue
            try:
                value = self._parse(field, raw)
                if value is None and field in _NOT_BLANK:
                    raise ValueError("can't be blank")
                if field == "group":
                    # A move between groups, recorded exactly as the board's
                    # Group dropdown records one.
                    update = InductionEntryUpdate(foundation_group=parse_foundation_group(raw))
                    await self.service.update(entry.id, update, actor_id=None)
                elif field in _GROUP_OF:
                    update = InductionDetailsUpdate(**{_GROUP_OF[field]: {field: value}})
                    await self.service.update_details(entry.id, update, actor_id=None)
                else:
                    await self.service.update(entry.id, InductionEntryUpdate(**{field: value}), actor_id=None)
            except Exception as exc:  # noqa: BLE001 - every refusal becomes a Sync Note
                errors.append(f"{self.column(field).header}: {error_message(exc)}")
        if paired:
            try:
                update = InductionEntryUpdate(**{field: optional(raw) for field, raw in paired.items()})
                await self.service.update(entry.id, update, actor_id=None)
            except Exception as exc:  # noqa: BLE001 - every refusal becomes a Sync Note
                headers = " / ".join(self.column(field).header for field in paired)
                errors.append(f"{headers}: {error_message(exc)}")
        return errors

    async def create(self, row: dict[str, str]) -> tuple[InductionEntry, list[str]]:
        self._check_required(row)
        data = InductionEntryCreate(
            name=row["name"].strip(),
            phone=row["phone"].strip(),
            email=optional(row.get("email", "")),
            # The board's form requires a date; a sheet row without one was
            # most likely typed in today.
            registration_date=parse_date(row.get("registration_date", "")) or utcnow().date(),
            paid_date=parse_date(row.get("paid_date", "")),
            sales_person=optional(row.get("sales_person", "")),
            lead_source=optional(row.get("lead_source", "")),
            payment_mode=optional(row.get("payment_mode", "")),
            category=optional(row.get("category", "")),
            section=self.default_section(row.get("section", "")),
            group=optional(row.get("group", "")),
        )
        entry = await self.service.create(data, actor_id=None)
        rest = {
            key: value
            for key, value in row.items()
            if value.strip() and (key in _INDUCTION_PAIRED or key in _GROUP_OF)
        }
        return entry, await self.apply(entry, rest, row)


# ---------------------------------------------------------------------------
# Foundation tab <- Lead (the board's All Leads)
# ---------------------------------------------------------------------------

_LEAD_TEXT_FIELDS = {
    "name": "name",
    "phone": "phone",
    "email": "email",
    "course": "course_interest",
    "batch": "batch_number",
    "qr_code": "qr_code",
    "query": "notes",
}


class FoundationTab(SheetTabSpec):
    key = "foundation"
    required_on_create = ("name", "phone", "course")
    columns = [
        Column("name", "Name"),
        Column("phone", "Mobile Number"),
        Column("email", "Email"),
        Column("course", "Course"),
        Column("section", "Section", create_only=True),
        Column("date", "Date", editable=False),
        Column("group", "Group", editable=False),
        Column("batch", "Batch"),
        Column("payment_plan", "Payment Method"),
        Column("paying_amount", "Paying Amount"),
        Column("qr_code", "QR-Code"),
        Column("payment_call_remarks", "Payment Remarks"),
        Column("stage", "Stage"),
        Column("lost_reason", "Lost Reason"),
        Column("query", "Query"),
        Column("remarks", "Remarks"),
        Column("assigned_to", "Assigned To", editable=False),
    ]

    def __init__(self) -> None:
        self.service = LeadService()

    async def load_records(self) -> list[Lead]:
        # The board's own filter: an imported lead still waiting on Form Check
        # isn't on All Leads yet, so it isn't on the tab either.
        query = self.scope({"is_deleted": False, "reviewed": {"$ne": False}})
        return await Lead.find(query).sort("+created_at").to_list()

    def values(self, lead: Lead) -> dict[str, str]:
        values = {key: cell_text(getattr(lead, field)) for key, field in _LEAD_TEXT_FIELDS.items()}
        values.update(
            section=self.section_label(lead.section),
            date=cell_text(lead.created_at),
            group=foundation_group_label(lead.foundation_group),
            payment_plan=PAYMENT_PLAN_LABELS.get(lead.payment_plan, "") if lead.payment_plan else "",
            paying_amount=cell_text(lead.paying_amount),
            payment_call_remarks=(
                PAYMENT_REMARK_LABELS.get(lead.payment_call_remarks, lead.payment_call_remarks)
                if lead.payment_call_remarks
                else ""
            ),
            stage=LEAD_STAGE_LABELS.get(lead.status, lead.status),
            lost_reason=cell_text(lead.lost_reason),
            # The newest dated remark - the same one-line mirror the board's
            # Remarks cell leads with.
            remarks=cell_text(lead.remarks),
            assigned_to=self.assignee(lead.assigned_to),
        )
        return values

    async def _apply_one(self, lead_id: uuid.UUID, key: str, raw: str, row: dict[str, str]) -> None:
        if key in _LEAD_TEXT_FIELDS:
            value = optional(raw)
            if value is None and key in {"name", "phone"}:
                raise ValueError("can't be blank")
            await self.service.update(lead_id, LeadUpdate(**{_LEAD_TEXT_FIELDS[key]: value}), actor_id=None)
        elif key == "paying_amount":
            await self.service.update(lead_id, LeadUpdate(paying_amount=parse_amount(raw)), actor_id=None)
        elif key == "payment_call_remarks":
            # A remark the menu doesn't have is kept as typed - the board can
            # add its own, so the sheet can too.
            remark = parse_choice_safe(raw, PAYMENT_REMARK_LABELS) or optional(raw)
            await self.service.update(lead_id, LeadUpdate(payment_call_remarks=remark), actor_id=None)
        elif key == "stage":
            stage = parse_choice(raw, LEAD_STAGE_LABELS)
            if stage is None:
                raise ValueError("can't be blank")
            # Sent together: moving to Lost is refused without a reason.
            update = LeadUpdate(status=stage, lost_reason=optional(row.get("lost_reason", "")))
            await self.service.update(lead_id, update, actor_id=None)
        elif key == "lost_reason":
            await self.service.update(lead_id, LeadUpdate(lost_reason=optional(raw)), actor_id=None)
        elif key == "payment_plan":
            plan = parse_choice(raw, PAYMENT_PLAN_LABELS)
            if plan is None:
                raise ValueError("a payment method can't be removed - change it in the ERP")
            lead = await self.service.get(lead_id)
            if not lead.program_interest:
                raise ValueError("this lead has no program yet - assign one in the ERP first")
            data = LeadPlanAssign(program_interest=lead.program_interest, payment_plan=plan)
            await self.service.assign_plan(lead_id, data, actor_id=None)
        elif key == "remarks":
            text = raw.strip()
            if not text:
                raise ValueError("remarks can't be deleted from the sheet - delete them in the ERP")
            # A new dated remark rather than an overwrite: remarks are a diary,
            # and the cell shows the newest entry.
            await self.service.add_remark(lead_id, LeadRemarkCreate(text=text), actor_id=None)

    async def apply(self, lead: Lead, edits: dict[str, str], row: dict[str, str]) -> list[str]:
        errors = []
        # A Stage edit already carries the Lost Reason beside it.
        keys = [key for key in edits if not (key == "lost_reason" and "stage" in edits)]
        for key in keys:
            try:
                await self._apply_one(lead.id, key, edits[key], row)
            except Exception as exc:  # noqa: BLE001 - every refusal becomes a Sync Note
                errors.append(f"{self.column(key).header}: {error_message(exc)}")
        return errors

    async def create(self, row: dict[str, str]) -> tuple[Lead, list[str]]:
        self._check_required(row)
        section = await InductionEntryService().resolve_section(self.default_section(row.get("section", "")))
        data = LeadCreate(
            name=row["name"].strip(),
            phone=row["phone"].strip(),
            email=optional(row.get("email", "")),
            course_interest=row["course"].strip(),
            notes=optional(row.get("query", "")),
            section=section,
            source=LeadSource.OTHER,
        )
        lead = await self.service.create(data, actor_id=None)
        rest_keys = (
            "batch", "payment_plan", "paying_amount", "qr_code", "payment_call_remarks", "stage", "lost_reason", "remarks",
        )
        rest = {key: row[key] for key in rest_keys if row.get(key, "").strip()}
        # A new lead starts at New Lead; only a different stage is a change.
        if parse_choice_safe(rest.get("stage", ""), LEAD_STAGE_LABELS) == LeadStatus.NEW_LEAD:
            rest.pop("stage")
        return lead, await self.apply(lead, rest, row)


def parse_choice_safe(raw: str, labels: dict[str, str]) -> str | None:
    try:
        return parse_choice(raw, labels)
    except ValueError:
        return None
