"""Tests for the HR Coordinator's student tabs and WhatsApp group onboarding."""
from datetime import date, timedelta

import pytest
import pytest_asyncio

from app.database.base import utcnow
from app.models.enums import LeadStatus, WhatsAppGroupStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import INVITE_WAIT, Lead
from app.services.batch_confirmation_service import BatchConfirmationService
from app.services.foundation_form_config_service import FoundationFormConfigService

# A real-shaped invite link; the config rejects anything that isn't one.
GROUP_LINK = "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt"


@pytest_asyncio.fixture(autouse=True)
async def _section_group_link(client):
    """Section A needs an invite link before anybody can be invited to it, and
    every test in this file works section A."""
    await FoundationFormConfigService().set_whatsapp_link("a", GROUP_LINK, actor_id=None)


async def make_lead(**overrides) -> Lead:
    lead = Lead(**{"name": "Harish", "phone": "9876543210", "section": "a", **overrides})
    await lead.insert()
    return lead


async def names_in(tab: str) -> list[str]:
    return [lead.name for lead in await BatchConfirmationService().list_hr_students(tab)]


async def test_a_lost_student_leaves_the_group_assigned_tab(client):
    """Losing a student doesn't clear the timestamp - they really were in the
    group - but listing them as an active member put them in two tabs at once
    and counted them twice on the cards above."""
    await make_lead(
        name="Harish",
        status=LeadStatus.LOST,
        group_assigned_at=utcnow(),
        lost_reason="Unreachable",
        lost_at=utcnow(),
    )
    await make_lead(name="Balamani", status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    assert await names_in("group_assigned") == ["Balamani"]
    assert await names_in("lost") == ["Harish"]


async def test_group_assigned_still_lists_active_members(client):
    await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())
    assert await names_in("group_assigned") == ["Harish"]


async def test_approved_excludes_anyone_already_in_a_group(client):
    await make_lead(name="Waiting", status=LeadStatus.BATCH_CONFIRMATION)
    await make_lead(name="Added", status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    assert await names_in("approved") == ["Waiting"]


async def test_batch_comes_from_the_linked_induction_entry(client):
    """The coordinator was re-typing a number the system already derives from
    the induction registration month, and any typo silently disagreed with the
    Induction board."""
    entry = InductionEntry(name="Harish", phone="9876543210", registration_date=date(2026, 8, 4))
    await entry.insert()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, induction_entry_id=entry.id)

    batches = await BatchConfirmationService().batches_for([lead])

    # August 2026 is the anchor month - see InductionEntryService.batch_for.
    assert batches[lead.id] == "Batch-28"


async def test_a_lead_without_induction_has_no_derived_batch(client):
    """An unmatched Foundation lead never went through Induction, so there is
    no registration month to read - the route falls back to whatever batch was
    typed by hand."""
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, batch_number="27")

    assert await BatchConfirmationService().batches_for([lead]) == {}


async def test_bulk_invite_reports_what_it_skipped(client):
    """One candidate who has already joined shouldn't discard the rest of a
    selection the coordinator has just worked through."""
    ok = await make_lead(name="Ready", status=LeadStatus.BATCH_CONFIRMATION)
    already = await make_lead(name="Already", status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())
    wrong_stage = await make_lead(name="TooEarly", status=LeadStatus.FINANCIAL_APPROVAL)

    sent, skipped = await BatchConfirmationService().send_whatsapp_invite_bulk(
        [ok.id, already.id, wrong_stage.id], actor_id=None
    )

    assert sent == 1
    assert sorted(skipped) == ["Already", "TooEarly"]


# ---------------------------------------------------------------------------
# WhatsApp group onboarding
# ---------------------------------------------------------------------------


async def test_sending_an_invite_does_not_mark_anyone_joined(client):
    """The whole point of the lifecycle. Sending and joining used to be one
    click, so the board reported group members on the strength of a message
    going out and nobody was ever chased."""
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = BatchConfirmationService()

    updated, delivered = await service.send_whatsapp_invite(lead.id, actor_id=None)

    assert updated.whatsapp_status == WhatsAppGroupStatus.INVITE_SENT
    assert updated.whatsapp_invite_sent_at is not None
    assert updated.group_assigned_at is None
    assert await names_in("group_assigned") == []


async def test_a_candidate_starts_not_invited(client):
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    assert lead.whatsapp_status == WhatsAppGroupStatus.NOT_INVITED


async def test_an_old_invite_reads_as_follow_up_required(client):
    """Derived from the clock, so it arrives the moment the wait elapses
    rather than whenever a job last ran."""
    lead = await make_lead(
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - INVITE_WAIT - timedelta(minutes=1),
        whatsapp_invite_count=1,
    )
    assert lead.whatsapp_status == WhatsAppGroupStatus.FOLLOW_UP_REQUIRED


async def test_a_recent_invite_is_still_just_waiting(client):
    lead = await make_lead(
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - timedelta(minutes=5),
        whatsapp_invite_count=1,
    )
    assert lead.whatsapp_status == WhatsAppGroupStatus.INVITE_SENT


async def test_resending_restarts_the_wait_and_counts_the_attempt(client):
    lead = await make_lead(
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - INVITE_WAIT - timedelta(hours=1),
        whatsapp_invite_count=1,
    )

    updated, delivered = await BatchConfirmationService().send_whatsapp_invite(lead.id, actor_id=None)

    assert updated.whatsapp_invite_count == 2
    assert updated.whatsapp_status == WhatsAppGroupStatus.INVITE_SENT


async def test_marking_joined_is_what_makes_someone_a_member(client):
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = BatchConfirmationService()
    await service.send_whatsapp_invite(lead.id, actor_id=None)

    updated = await service.mark_whatsapp_joined(lead.id, actor_id=None)

    assert updated.whatsapp_status == WhatsAppGroupStatus.JOINED
    assert updated.group_assigned_at is not None


async def test_an_invite_cannot_be_sent_to_someone_already_in(client):
    from app.exceptions.base import BadRequestError

    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())
    with pytest.raises(BadRequestError):
        await BatchConfirmationService().send_whatsapp_invite(lead.id, actor_id=None)


async def test_logging_a_follow_up_does_not_change_the_status(client):
    """They still haven't joined - it only records that somebody tried, so two
    coordinators don't ring the same person on the same day."""
    lead = await make_lead(
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - INVITE_WAIT - timedelta(minutes=1),
        whatsapp_invite_count=1,
    )

    updated = await BatchConfirmationService().log_whatsapp_follow_up(lead.id, actor_id=None)

    assert updated.whatsapp_last_follow_up_at is not None
    assert updated.whatsapp_status == WhatsAppGroupStatus.FOLLOW_UP_REQUIRED


async def test_the_status_filter_agrees_with_the_derived_status(client):
    """The model derives it for one lead, the query filters thousands - the
    two have to classify the same person the same way."""
    service = BatchConfirmationService()
    await make_lead(name="Fresh", status=LeadStatus.BATCH_CONFIRMATION)
    await make_lead(
        name="Waiting",
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - timedelta(minutes=5),
        whatsapp_invite_count=1,
    )
    await make_lead(
        name="Overdue",
        status=LeadStatus.BATCH_CONFIRMATION,
        whatsapp_invite_sent_at=utcnow() - INVITE_WAIT - timedelta(minutes=1),
        whatsapp_invite_count=1,
    )
    await make_lead(name="In", status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    for status, expected in [
        (WhatsAppGroupStatus.NOT_INVITED, ["Fresh"]),
        (WhatsAppGroupStatus.INVITE_SENT, ["Waiting"]),
        (WhatsAppGroupStatus.FOLLOW_UP_REQUIRED, ["Overdue"]),
        (WhatsAppGroupStatus.JOINED, ["In"]),
    ]:
        rows = await service.list_whatsapp_queue(status)
        assert [row.name for row in rows] == expected, status
        # Every row the query returned must derive the status it was filtered by.
        assert all(row.whatsapp_status == status for row in rows), status

    assert (await service.whatsapp_counts())["all"] == 4


async def test_bulk_invite_sends_rather_than_joining(client):
    first = await make_lead(name="One", status=LeadStatus.BATCH_CONFIRMATION)
    second = await make_lead(name="Two", status=LeadStatus.BATCH_CONFIRMATION)

    sent, skipped = await BatchConfirmationService().send_whatsapp_invite_bulk(
        [first.id, second.id], actor_id=None
    )

    assert (sent, skipped) == (2, [])
    assert await names_in("group_assigned") == []
    assert len(await BatchConfirmationService().list_whatsapp_queue(WhatsAppGroupStatus.INVITE_SENT)) == 2


async def test_every_step_lands_in_the_history(client):
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = BatchConfirmationService()

    await service.send_whatsapp_invite(lead.id, actor_id=None)
    await service.send_whatsapp_invite(lead.id, actor_id=None)
    await service.log_whatsapp_follow_up(lead.id, actor_id=None)
    await service.mark_whatsapp_joined(lead.id, actor_id=None)

    actions = [action for action, _, _ in await service.whatsapp_history(lead.id)]
    assert sorted(actions) == sorted(
        [
            "WHATSAPP_INVITE_SENT",
            "WHATSAPP_INVITE_RESENT",
            "WHATSAPP_FOLLOW_UP",
            "WHATSAPP_JOINED_MANUAL",
        ]
    )


async def test_an_invite_needs_a_group_link_for_the_section(client):
    """You cannot invite somebody to a group that has no link configured. The
    check is on the server rather than only in the board, so the bulk path and
    any future caller get it too."""
    from app.exceptions.base import BadRequestError

    # Section B has no link set by the fixture above.
    lead = await make_lead(section="b", status=LeadStatus.BATCH_CONFIRMATION)
    with pytest.raises(BadRequestError):
        await BatchConfirmationService().send_whatsapp_invite(lead.id, actor_id=None)


async def test_an_invite_is_recorded_even_when_it_could_not_be_sent(client):
    """No API credentials in the test environment, so the send is refused and
    the board falls back to a manual message - but the candidate must still
    move to Waiting for Join, or the row looks untouched and gets invited
    again."""
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)

    updated, delivered = await BatchConfirmationService().send_whatsapp_invite(lead.id, actor_id=None)

    assert delivered is False
    assert updated.whatsapp_status == WhatsAppGroupStatus.INVITE_SENT


async def test_the_history_says_whether_the_system_or_a_person_sent_it(client):
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = BatchConfirmationService()
    await service.send_whatsapp_invite(lead.id, actor_id=None)

    from app.models.audit_log import AuditLog

    entry = await AuditLog.find_one({"entity_id": str(lead.id), "action": "WHATSAPP_INVITE_SENT"})
    assert entry.changes["delivery"] == "manual"


# ---------------------------------------------------------------------------
# Finance reports non-payment -> HR removes -> student is Lost
# ---------------------------------------------------------------------------


async def make_hr_coordinator(seeded, email: str = "hr@hrnavinos.com"):
    """A user whose role holds batch_confirmation.allocate. Built through the
    real permission rather than a role named "HR Coordinator", which is what
    the notification targeting looks for."""
    from app.models.role import Role
    from app.models.user import User
    from app.permissions.permission_codes import Permissions
    from app.repositories.permission_repository import PermissionRepository

    permission = await PermissionRepository().get_by_code(Permissions.BATCH_CONFIRMATION_ALLOCATE)
    role = Role(name=f"Coordinator {email}", permission_ids=[permission.id])
    await role.insert()
    user = User(
        email=email, password_hash="x", first_name="HR", last_name="Coord", role_id=role.id, is_active=True
    )
    await user.insert()
    return user


async def test_finance_reporting_non_payment_notifies_hr(seeded):
    from decimal import Decimal

    from app.models.notification import Notification
    from app.services.lead_service import LeadService

    coordinator = await make_hr_coordinator(seeded)
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    notified = await LeadService().report_non_payment(
        lead.id, amount=Decimal("3500"), note=None, actor_id=None
    )

    # Not an exact count: targeting is by permission, and a Super Admin holds
    # every permission - so they are legitimately a recipient too. What matters
    # is that the coordinator got exactly one, naming the figure.
    assert notified >= 1
    raised = await Notification.find({"user_id": coordinator.id}).to_list()
    assert len(raised) == 1
    assert raised[0].category.value == "non_payment"
    assert "3,500" in raised[0].message


async def test_the_flag_stays_on_the_lead_not_only_in_the_notification(seeded):
    """A notification is read once by one person. The board has to keep showing
    which students Finance flagged after that."""
    from decimal import Decimal

    from app.services.lead_service import LeadService

    await make_hr_coordinator(seeded)
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    await LeadService().report_non_payment(lead.id, amount=Decimal("3500"), note=None, actor_id=None)

    refreshed = await Lead.get(lead.id)
    assert refreshed.non_payment_reported_at is not None
    assert refreshed.non_payment_amount == Decimal("3500")


async def test_removing_from_the_group_marks_the_student_lost(client):
    """Removal and marking lost are one decision - split into two buttons, the
    pair ends up half-done whenever somebody is interrupted between them."""
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    removed = await BatchConfirmationService().remove_from_group(lead.id, reason=None, actor_id=None)

    assert removed.status == LeadStatus.LOST
    assert removed.group_assigned_at is None
    assert "payment" in removed.lost_reason.lower()


async def test_a_removed_student_leaves_both_lists(client):
    """Clearing the timestamp takes them off the onboarding queue, LOST takes
    them out of the pipeline. Missing either leaves the row lingering in one
    of the two places."""
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())

    await BatchConfirmationService().remove_from_group(lead.id, reason=None, actor_id=None)

    assert await names_in("group_assigned") == []
    assert await BatchConfirmationService().list_whatsapp_queue() == []
    assert await names_in("lost") == ["Harish"]


async def test_opening_a_non_payment_notification_does_not_move_the_stage(seeded):
    """The removal it asks for sets the stage itself. Moving the lead on read
    would rewrite the board behind the coordinator's back."""
    from app.models.notification import Notification
    from app.services.notification_service import NotificationService

    coordinator = await make_hr_coordinator(seeded)
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    notification = Notification(
        user_id=coordinator.id,
        title="Payment not received",
        message="…",
        lead_id=lead.id,
        category="non_payment",
    )
    await notification.insert()

    await NotificationService().acknowledge(notification.id, user_id=coordinator.id)

    assert (await Lead.get(lead.id)).status == LeadStatus.BATCH_CONFIRMATION
