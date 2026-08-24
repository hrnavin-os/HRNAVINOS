"""HTTP routes for the Lead Management (CRM / Pre-Sales) module."""
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status

from app.core.dependencies import RequirePermissions, get_actor_scope
from app.exceptions.base import BadRequestError
from app.models.enums import InstallmentPaymentMode, LeadSource, PaymentMethod
from app.models.user import User
from app.permissions.permission_codes import Permissions
from app.schemas.common import MessageResponse, PaginatedResponse, PaginationParams
from app.schemas.induction_entry_schema import InductionEntryResponse
from app.schemas.lead_schema import (
    LeadAssign,
    LeadCreate,
    LeadPlanAssign,
    LeadResponse,
    LeadStatsResponse,
    LeadTimelineEntryResponse,
    LeadUpdate,
)
from app.schemas.notification_schema import (
    NonPaymentReportRequest,
    PaymentReminderRequest,
    PaymentReminderResponse,
)
from app.services.induction_entry_service import InductionEntryService
from app.services.lead_service import LeadService

router = APIRouter(prefix="/leads", tags=["Lead Management"])


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_CREATE)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    return await service.to_response(await service.create(payload, actor_id=actor.id, scope=scope))


@router.get("", response_model=PaginatedResponse[LeadResponse])
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    assigned_to: uuid.UUID | None = None,
    source: LeadSource | None = None,
    section: str | None = None,
    course_interest: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    induction_matched: bool | None = None,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> PaginatedResponse[LeadResponse]:
    params = PaginationParams(page=page, page_size=page_size, search=search, sort_by=sort_by, sort_order=sort_order)
    service = LeadService()
    scope = await get_actor_scope(actor)
    result = await service.list(
        params,
        status=status_filter,
        assigned_to=assigned_to,
        source=source,
        section=section,
        section_scope=scope,
        course_interest=course_interest,
        date_from=date_from,
        date_to=date_to,
        induction_matched=induction_matched,
    )
    items = [await service.to_response(lead) for lead in result.items]
    return PaginatedResponse[LeadResponse].build(items, result.total, result.page, result.page_size)


@router.get("/stats", response_model=LeadStatsResponse)
async def lead_stats(
    section: str | None = None,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> LeadStatsResponse:
    scope = await get_actor_scope(actor)
    return await LeadService().stats(section=scope or section)


@router.get("/course-options", response_model=list[str])
async def list_course_options(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> list[str]:
    """Distinct course_interest values currently in use, for the Leads page's
    Course filter dropdown - not a closed enum, so this reflects real data
    rather than a hardcoded list."""
    return await LeadService().course_options()


@router.get("/course-catalog", response_model=list[str])
async def list_course_catalog(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> list[str]:
    """Every course a lead can be moved onto, for the board's Course dropdown.

    Separate from /course-options, which is the distinct values in use: that is
    right for a filter, where an option matching nothing is a dead end, and
    wrong for setting one, where putting somebody on a course nobody is on yet
    is the whole point.

    Behind LEADS_VIEW rather than PROGRAMS_VIEW - anyone who can work the board
    can read the list of courses it offers, and gating it on the Programs
    module would leave the dropdown empty for the people who actually use it.
    """
    return await LeadService().course_catalog()


@router.get("/pending-review", response_model=list[LeadResponse])
async def list_pending_review_leads(
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> list[LeadResponse]:
    """Form Check queue: leads imported from an integration (e.g. Google Sheets)
    that haven't been checked yet, so they aren't visible in Leads (CRM)."""
    service = LeadService()
    return [await service.to_response(lead) for lead in await service.list_pending_review()]


@router.post("/{lead_id}/review", response_model=LeadResponse)
async def review_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    """Approve a Form Check submission (with any corrections), admitting it
    into the normal pipeline where it shows up in Leads (CRM) / New Lead."""
    service = LeadService()
    scope = await get_actor_scope(actor)
    return await service.to_response(await service.review(lead_id, payload, actor_id=actor.id, scope=scope))


@router.get("/{lead_id}/timeline", response_model=list[LeadTimelineEntryResponse])
async def get_lead_timeline(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> list[LeadTimelineEntryResponse]:
    scope = await get_actor_scope(actor)
    return await LeadService().timeline(lead_id, scope=scope)


@router.get("/{lead_id}/induction", response_model=InductionEntryResponse | None)
async def get_lead_induction(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> InductionEntryResponse | None:
    """The Induction Call Form entry this lead was matched to, or null.

    A separate call rather than part of the lead response: only the detail view
    needs it, and folding it in would cost a second query per row on every page
    of the board to serve something the list never shows.

    Fetched through LeadService.get first so a Section Admin can't read another
    section's induction record by guessing a lead id.
    """
    lead = await LeadService().get(lead_id, scope=await get_actor_scope(actor))
    if lead.induction_entry_id is None:
        return None
    service = InductionEntryService()
    # get_by_id, not the board's list: the entry is converted by definition
    # here, and the board deliberately excludes those.
    entry = await service.entries.get_by_id(lead.induction_entry_id)
    return await service.to_response(entry) if entry else None


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_VIEW)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    return await service.to_response(await service.get(lead_id, scope=scope))


@router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: uuid.UUID,
    payload: LeadUpdate,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    return await service.to_response(await service.update(lead_id, payload, actor_id=actor.id, scope=scope))


@router.post("/{lead_id}/payment-image", response_model=LeadResponse)
async def upload_payment_image(
    lead_id: uuid.UUID,
    file: UploadFile | None = File(default=None),
    paid_amount: str | None = Form(default=None),
    payment_mode: PaymentMethod | None = Form(default=None),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    parsed_amount: Decimal | None = None
    if paid_amount:
        try:
            parsed_amount = Decimal(paid_amount)
        except InvalidOperation as exc:
            raise BadRequestError("Paid amount must be a valid number.") from exc

    service = LeadService()
    scope = await get_actor_scope(actor)
    lead = await service.update_payment_info(
        lead_id, file=file, paid_amount=parsed_amount, payment_mode=payment_mode, actor_id=actor.id, scope=scope
    )
    return await service.to_response(lead)


@router.post("/{lead_id}/plan", response_model=LeadResponse)
async def assign_lead_plan(
    lead_id: uuid.UUID,
    payload: LeadPlanAssign,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    lead = await service.assign_plan(lead_id, payload, actor_id=actor.id, scope=scope)
    return await service.to_response(lead)


@router.post("/{lead_id}/installments/{index}", response_model=LeadResponse)
async def update_installment(
    lead_id: uuid.UUID,
    index: int,
    file: UploadFile | None = File(default=None),
    amount: str | None = Form(default=None),
    mode: InstallmentPaymentMode | None = Form(default=None),
    transaction_id: str | None = Form(default=None),
    upi_id: str | None = Form(default=None),
    scheduled_at: date | None = Form(default=None),
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    parsed_amount: Decimal | None = None
    if amount:
        try:
            parsed_amount = Decimal(amount)
        except InvalidOperation as exc:
            raise BadRequestError("Amount must be a valid number.") from exc

    service = LeadService()
    scope = await get_actor_scope(actor)
    lead = await service.update_installment(
        lead_id,
        index,
        file=file,
        amount=parsed_amount,
        mode=mode,
        transaction_id=transaction_id,
        upi_id=upi_id,
        scheduled_at=scheduled_at,
        actor_id=actor.id,
        scope=scope,
    )
    return await service.to_response(lead)


@router.post("/{lead_id}/mark-lost", response_model=LeadResponse)
async def mark_lead_lost(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_UPDATE)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    lead = await service.mark_lost_nonpayment(lead_id, actor_id=actor.id, scope=scope)
    return await service.to_response(lead)


@router.post("/{lead_id}/payment-reminder", response_model=PaymentReminderResponse)
async def send_payment_reminder(
    lead_id: uuid.UUID,
    payload: PaymentReminderRequest,
    # Gated on PAYMENTS_VIEW rather than NOTIFICATIONS_CREATE: this is a
    # Finance action taken from the Cashbook, and Finance holds that.
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_VIEW)),
) -> PaymentReminderResponse:
    notified, already_pending = await LeadService().send_payment_reminder(
        lead_id, payload.kind, note=payload.note, actor_id=actor.id
    )
    if notified == 0 and already_pending:
        # Said plainly rather than reported as a successful send. Claiming to
        # have sent something that was deliberately suppressed is how you end
        # up pressing the button a third time.
        return PaymentReminderResponse(
            message=(
                f"{already_pending} section admin{'' if already_pending == 1 else 's'} already "
                "have this reminder unopened, so no duplicate was sent."
            ),
            notified=0,
            already_pending=already_pending,
        )
    if notified == 0:
        return PaymentReminderResponse(
            message="No section admin is set up for this lead's section yet, so nobody was notified.",
            notified=0,
        )
    suffix = f" {already_pending} already had it unopened." if already_pending else ""
    return PaymentReminderResponse(
        message=f"Reminder sent to {notified} section admin{'' if notified == 1 else 's'}.{suffix}",
        notified=notified,
        already_pending=already_pending,
    )


@router.post("/{lead_id}/non-payment", response_model=PaymentReminderResponse)
async def report_non_payment(
    lead_id: uuid.UUID,
    payload: NonPaymentReportRequest,
    # Same gate as the payment reminder: this is a Finance judgement made from
    # the Cashbook, and Finance holds PAYMENTS_VIEW.
    actor: User = Depends(RequirePermissions(Permissions.PAYMENTS_VIEW)),
) -> PaymentReminderResponse:
    """Finance declares a student a non-payer, for HR to act on.

    Goes to the HR Coordinators rather than the section admins - the action it
    asks for is theirs: take the student out of the batch group, which marks
    them lost.
    """
    notified = await LeadService().report_non_payment(
        lead_id, amount=payload.amount, note=payload.note, actor_id=actor.id
    )
    if notified == 0:
        return PaymentReminderResponse(
            message="Flagged, but no HR Coordinator is set up yet, so nobody was notified.",
            notified=0,
        )
    return PaymentReminderResponse(
        message=f"HR notified ({notified} coordinator{'' if notified == 1 else 's'}).",
        notified=notified,
    )


@router.post("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: uuid.UUID,
    payload: LeadAssign,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_ASSIGN)),
) -> LeadResponse:
    service = LeadService()
    scope = await get_actor_scope(actor)
    return await service.to_response(await service.assign(lead_id, payload, actor_id=actor.id, scope=scope))


@router.delete("/{lead_id}", response_model=MessageResponse)
async def delete_lead(
    lead_id: uuid.UUID,
    actor: User = Depends(RequirePermissions(Permissions.LEADS_DELETE)),
) -> MessageResponse:
    scope = await get_actor_scope(actor)
    await LeadService().delete(lead_id, actor_id=actor.id, scope=scope)
    return MessageResponse(message="Lead deleted successfully.")
