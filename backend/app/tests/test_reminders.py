"""Tests for the date-driven reminders: a lead's scheduled follow-up and a
two-shot plan's scheduled installment."""
from datetime import date, timedelta

import pytest

from app.database.base import utcnow
from app.models.enums import LeadStatus, NotificationCategory
from app.models.lead import Lead, PaymentInstallment
from app.models.role import Role
from app.models.user import User
from app.services.reminder_service import ReminderService

SECTION = "a"


async def make_section_admin(email: str = "asection@hrnavinos.com") -> User:
    """A user whose role is scoped to section A - the shape the reminder
    targeting looks for. Built directly rather than through the API so the test
    doesn't depend on the role-creation endpoints."""
    role = Role(name=f"Admin {email}", description="Section admin", scoped_section=SECTION)
    await role.insert()
    user = User(
        email=email,
        password_hash="not-a-real-hash",
        first_name="Section",
        last_name="Admin",
        role_id=role.id,
        is_active=True,
    )
    await user.insert()
    return user


async def make_lead(**overrides) -> Lead:
    lead = Lead(
        name="Arun",
        phone="9876543210",
        section=SECTION,
        **overrides,
    )
    await lead.insert()
    return lead


async def notifications_for(user: User) -> list:
    """This user's live notifications - what the panel would actually show.
    Deletes are soft, so the row survives; excluding them here is what makes
    "deleted" and "gone from the list" the same assertion."""
    from app.models.notification import Notification

    return await Notification.find({"user_id": user.id, "is_deleted": False}).to_list()


# --------------------------------------------------------------------------
# Follow-up reminders
# --------------------------------------------------------------------------


async def test_due_follow_up_notifies_the_section_admin(client):
    admin = await make_section_admin()
    await make_lead(follow_up_at=utcnow() - timedelta(minutes=5))

    assert await ReminderService().sweep() == 1

    raised = await notifications_for(admin)
    assert len(raised) == 1
    assert raised[0].category == NotificationCategory.FOLLOW_UP_DUE
    assert "Arun" in raised[0].message


async def test_follow_up_in_the_future_is_not_raised_yet(client):
    admin = await make_section_admin()
    await make_lead(follow_up_at=utcnow() + timedelta(days=2))

    assert await ReminderService().sweep() == 0
    assert await notifications_for(admin) == []


async def test_overdue_follow_up_is_still_raised(client):
    """The sweep only runs while somebody is looking. A follow-up that came due
    over a weekend has to surface on Monday rather than be missed."""
    admin = await make_section_admin()
    await make_lead(follow_up_at=utcnow() - timedelta(days=6))

    assert await ReminderService().sweep() == 1
    assert len(await notifications_for(admin)) == 1


async def test_sweeping_repeatedly_raises_one_reminder(client):
    admin = await make_section_admin()
    await make_lead(follow_up_at=utcnow() - timedelta(minutes=5))

    service = ReminderService()
    assert await service.sweep() == 1
    # The sweep runs on every notification poll, so this is the normal case,
    # not an edge one - without the dedupe key it would notify every minute.
    assert await service.sweep() == 0
    assert await service.sweep() == 0
    assert len(await notifications_for(admin)) == 1


async def test_rescheduling_the_follow_up_earns_a_new_reminder(client):
    admin = await make_section_admin()
    lead = await make_lead(follow_up_at=utcnow() - timedelta(days=3))

    await ReminderService().sweep()
    lead.follow_up_at = utcnow() - timedelta(minutes=1)
    await lead.save()
    await ReminderService().sweep()

    # A new promise for a new day is a different reminder, keyed by due date.
    assert len(await notifications_for(admin)) == 2


async def test_lost_leads_are_not_chased(client):
    admin = await make_section_admin()
    await make_lead(follow_up_at=utcnow() - timedelta(days=1), status=LeadStatus.LOST)

    assert await ReminderService().sweep() == 0
    assert await notifications_for(admin) == []


async def test_a_lead_with_no_section_has_nobody_to_notify(client):
    admin = await make_section_admin()
    lead = Lead(name="Orphan", phone="9000000000", follow_up_at=utcnow() - timedelta(days=1))
    await lead.insert()

    assert await ReminderService().sweep() == 0
    assert await notifications_for(admin) == []


async def test_every_admin_of_the_section_is_notified(client):
    first = await make_section_admin("one@hrnavinos.com")
    second = await make_section_admin("two@hrnavinos.com")
    await make_lead(follow_up_at=utcnow() - timedelta(minutes=5))

    assert await ReminderService().sweep() == 2
    assert len(await notifications_for(first)) == 1
    assert len(await notifications_for(second)) == 1


# --------------------------------------------------------------------------
# Installment reminders
# --------------------------------------------------------------------------


async def test_due_scheduled_installment_notifies_the_section_admin(client):
    admin = await make_section_admin()
    await make_lead(
        installments=[
            PaymentInstallment(label="Payment 1", paid=True),
            PaymentInstallment(label="Payment 2", scheduled_at=date.today(), paid=False),
        ]
    )

    assert await ReminderService().sweep() == 1
    raised = await notifications_for(admin)
    assert raised[0].category == NotificationCategory.INSTALLMENT_DUE
    assert "Payment 2" in raised[0].message


async def test_paid_installment_is_not_chased(client):
    admin = await make_section_admin()
    await make_lead(
        installments=[PaymentInstallment(label="Payment 2", scheduled_at=date.today(), paid=True)]
    )

    assert await ReminderService().sweep() == 0
    assert await notifications_for(admin) == []


async def test_installment_scheduled_for_later_is_not_raised_yet(client):
    admin = await make_section_admin()
    await make_lead(
        installments=[
            PaymentInstallment(label="Payment 2", scheduled_at=date.today() + timedelta(days=5), paid=False)
        ]
    )

    assert await ReminderService().sweep() == 0
    assert await notifications_for(admin) == []


async def test_two_installments_due_the_same_day_raise_two_reminders(client):
    admin = await make_section_admin()
    await make_lead(
        installments=[
            PaymentInstallment(label="Payment 1", scheduled_at=date.today(), paid=False),
            PaymentInstallment(label="Payment 2", scheduled_at=date.today(), paid=False),
        ]
    )

    # Keyed by index as well as date, or the second would look like a duplicate
    # of the first and be dropped.
    assert await ReminderService().sweep() == 2
    assert len(await notifications_for(admin)) == 2


# --------------------------------------------------------------------------
# Opening a reminder
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "category",
    [NotificationCategory.FOLLOW_UP_DUE, NotificationCategory.INSTALLMENT_DUE],
)
async def test_opening_a_date_reminder_leaves_the_stage_alone(client, category):
    """Only a Finance payment reminder drags its lead back to follow-up.
    A date coming round says nothing about where the lead belongs, and moving
    it would rewrite the board every time somebody read their notifications."""
    from app.models.notification import Notification
    from app.services.notification_service import NotificationService

    admin = await make_section_admin()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    notification = Notification(
        user_id=admin.id, title="Due", message="Due", lead_id=lead.id, category=category
    )
    await notification.insert()

    await NotificationService().acknowledge(notification.id, user_id=admin.id)

    assert (await Lead.get(lead.id)).status == LeadStatus.BATCH_CONFIRMATION


# --------------------------------------------------------------------------
# Finance payment reminders - repeat presses
# --------------------------------------------------------------------------


async def test_pressing_send_reminder_twice_does_not_stack_a_duplicate(client):
    from app.services.lead_service import LeadService

    admin = await make_section_admin()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = LeadService()

    assert await service.send_payment_reminder(lead.id, "due", note=None, actor_id=None) == (1, 0)
    # The second press finds the first still unopened, so it says so rather
    # than adding another copy to the same panel.
    assert await service.send_payment_reminder(lead.id, "due", note=None, actor_id=None) == (0, 1)
    assert len(await notifications_for(admin)) == 1


async def test_a_different_reminder_kind_is_not_suppressed(client):
    from app.services.lead_service import LeadService

    admin = await make_section_admin()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = LeadService()

    await service.send_payment_reminder(lead.id, "due", note=None, actor_id=None)
    # An after-placement fee is a different thing to chase, so an unread
    # payment-due reminder must not mask it.
    assert await service.send_payment_reminder(lead.id, "after_placement", note=None, actor_id=None) == (1, 0)
    assert len(await notifications_for(admin)) == 2


async def test_chasing_again_is_allowed_once_the_first_was_read(client):
    """Suppression is about unopened copies piling up, not a cooling-off
    period. If they read it and the money still hasn't come in, Finance has to
    be able to chase again."""
    from app.services.notification_service import NotificationService
    from app.services.lead_service import LeadService

    admin = await make_section_admin()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    service = LeadService()

    await service.send_payment_reminder(lead.id, "due", note=None, actor_id=None)
    first = (await notifications_for(admin))[0]
    await NotificationService().mark_read(first.id, user_id=admin.id)

    assert await service.send_payment_reminder(lead.id, "due", note=None, actor_id=None) == (1, 0)
    assert len(await notifications_for(admin)) == 2


# --------------------------------------------------------------------------
# Dismissing notifications
# --------------------------------------------------------------------------


async def make_notification(user: User, title: str = "Due"):
    from app.models.notification import Notification

    notification = Notification(user_id=user.id, title=title, message="Due")
    await notification.insert()
    return notification


async def test_deleting_a_notification_removes_it_from_the_list(client):
    from app.schemas.common import PaginationParams
    from app.services.notification_service import NotificationService

    admin = await make_section_admin()
    notification = await make_notification(admin)
    service = NotificationService()

    await service.delete(notification.id, user_id=admin.id)

    listing = await service.list_for_user(admin.id, PaginationParams(page=1, page_size=20))
    assert listing.total == 0


async def test_deleting_someone_elses_notification_is_refused(client):
    from app.exceptions.base import NotFoundError
    from app.services.notification_service import NotificationService

    owner = await make_section_admin("owner@hrnavinos.com")
    other = await make_section_admin("other@hrnavinos.com")
    notification = await make_notification(owner)

    # Not Found rather than Forbidden, so the endpoint can't be used to probe
    # which notification ids exist.
    with pytest.raises(NotFoundError):
        await NotificationService().delete(notification.id, user_id=other.id)

    assert len(await notifications_for(owner)) == 1


async def test_bulk_delete_removes_only_the_callers_own(client):
    from app.services.notification_service import NotificationService

    owner = await make_section_admin("owner@hrnavinos.com")
    other = await make_section_admin("other@hrnavinos.com")
    mine = [await make_notification(owner), await make_notification(owner)]
    theirs = await make_notification(other)

    # The other person's id is passed deliberately: user_id is part of the
    # query filter, so it simply doesn't match rather than being trusted.
    deleted = await NotificationService().delete_many(
        [item.id for item in mine] + [theirs.id], user_id=owner.id
    )

    assert deleted == 2
    assert await notifications_for(owner) == []
    assert len(await notifications_for(other)) == 1


async def test_a_deleted_notification_stops_counting_as_unread(client):
    from app.services.notification_service import NotificationService

    admin = await make_section_admin()
    notification = await make_notification(admin)
    service = NotificationService()
    assert await service.unread_count(admin.id) == 1

    await service.delete(notification.id, user_id=admin.id)

    assert await service.unread_count(admin.id) == 0


async def test_opening_a_payment_reminder_still_moves_the_lead(client):
    """The pre-existing behaviour, which the category check must not break -
    including for reminders raised before categories existed (category=None)."""
    from app.models.notification import Notification
    from app.services.notification_service import NotificationService

    admin = await make_section_admin()
    lead = await make_lead(status=LeadStatus.BATCH_CONFIRMATION)
    notification = Notification(user_id=admin.id, title="Pay", message="Pay", lead_id=lead.id)
    await notification.insert()

    await NotificationService().acknowledge(notification.id, user_id=admin.id)

    assert (await Lead.get(lead.id)).status == LeadStatus.PRE_SCREENING
