"""Tests for the HR Coordinator's student tabs."""
from datetime import date

from app.database.base import utcnow
from app.models.enums import LeadStatus
from app.models.induction_entry import InductionEntry
from app.models.lead import Lead
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


async def test_bulk_group_assign_marks_the_selection(client):
    first = await make_lead(name="One", status=LeadStatus.BATCH_CONFIRMATION)
    second = await make_lead(name="Two", status=LeadStatus.BATCH_CONFIRMATION)

    assigned, skipped = await BatchConfirmationService().set_group_assigned_bulk(
        [first.id, second.id], actor_id=None
    )

    assert (assigned, skipped) == (2, [])
    assert sorted(await names_in("group_assigned")) == ["One", "Two"]


async def test_bulk_group_assign_reports_what_it_skipped(client):
    """One lead that has moved on shouldn't discard the rest of a selection the
    coordinator has just worked through."""
    ok = await make_lead(name="Ready", status=LeadStatus.BATCH_CONFIRMATION)
    already = await make_lead(name="Already", status=LeadStatus.BATCH_CONFIRMATION, group_assigned_at=utcnow())
    wrong_stage = await make_lead(name="TooEarly", status=LeadStatus.FINANCIAL_APPROVAL)

    assigned, skipped = await BatchConfirmationService().set_group_assigned_bulk(
        [ok.id, already.id, wrong_stage.id], actor_id=None
    )

    assert assigned == 1
    assert sorted(skipped) == ["Already", "TooEarly"]
