"""Tests for the HR Coordinator's student tabs and WhatsApp group onboarding."""
from datetime import date, timedelta

import pytest

from app.database.base import utcnow
from app.models.enums import LeadStatus, WhatsAppGroupStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import INVITE_WAIT, Lead
from app.services.batch_confirmation_service import BatchConfirmationService


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

    updated = await service.send_whatsapp_invite(lead.id, actor_id=None)

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

    updated = await BatchConfirmationService().send_whatsapp_invite(lead.id, actor_id=None)

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
