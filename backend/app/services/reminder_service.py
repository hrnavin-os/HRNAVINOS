"""Date-driven reminders for section admins.

Two dates in the CRM are promises to come back to a lead on a particular day:
the follow-up scheduled on the lead's Follow-up tab, and the date a two-shot
plan's second installment is expected. Both were write-only - somebody picked a
day, and nothing brought it back up when the day arrived.

WHY THERE IS NO SCHEDULER
-------------------------
The obvious answer is a cron entry or an in-process scheduler, and both are a
worse fit here:

  * The app runs under several gunicorn workers. An in-process scheduler fires
    once per worker, so every reminder would be raised N times unless a
    distributed lock is added - a lock, and a new dependency, to serve a query
    that takes milliseconds.
  * deploy.sh doesn't install crontabs, so a cron entry would have to be set up
    by hand on the VPS and would silently not exist on any rebuilt machine.
    Reminders that quietly stop is the failure mode to avoid.

So the sweep runs on read instead, off the notification poll the bell already
makes every 60 seconds, throttled per worker. Idempotence comes from
`dedupe_key` and its unique index rather than from only running once, which
means running it more often is harmless and running it from anywhere else -
a cron curl, a management command - needs no coordination.

The trade-off is that nothing is raised while no section admin is logged in.
That costs nothing: these reminders are only ever read inside the app, and the
sweep matches every date at or before now, so opening the app after a week away
surfaces everything missed rather than only today's.
"""
import logging
import uuid
from datetime import date, datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.database.base import utcnow
from app.models.enums import NotificationCategory, NotificationType
from app.models.lead import Lead
from app.models.notification import Notification
from app.models.user import User
from app.repositories.lead_repository import LeadRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# How long a worker waits before sweeping again. The bell polls every 60s and
# several admins may be polling at once, so without this the sweep would run
# once per admin per minute to find the same nothing.
SWEEP_INTERVAL_SECONDS = 60

# Guards the sweep per worker process. Deliberately not shared state: two
# workers both sweeping is already safe, and making this correct across
# processes would need the lock this design exists to avoid.
_last_sweep_at: datetime | None = None


def _due_installments(lead: Lead, today: date) -> list[tuple[int, str]]:
    """(index, label) for each unpaid installment of this lead that has come
    due. The repository query finds leads with at least one; this picks out
    which, since a plan can have several."""
    return [
        (index, installment.label)
        for index, installment in enumerate(lead.installments)
        if not installment.paid and installment.scheduled_at and installment.scheduled_at <= today
    ]


class ReminderService:
    def __init__(self) -> None:
        self.leads = LeadRepository()
        self.roles = RoleRepository()
        self.users = UserRepository()

    async def _section_admins(self, section: str | None) -> list[User]:
        """Everyone whose role is scoped to this section.

        Same targeting as a Finance payment reminder: the people who own that
        pipeline, not everyone. A lead with no section has nobody to tell, and
        gets skipped rather than broadcast.
        """
        if not section:
            return []
        recipients: list[User] = []
        for role in await self.roles.list_by_scoped_section(section):
            users, _ = await self.users.list(page=1, page_size=1000, filters={"role_id": role.id, "is_active": True})
            recipients.extend(users)
        # One person holding two scoped roles should still get one reminder.
        return list({user.id: user for user in recipients}.values())

    async def _follow_up_recipients(self, lead: Lead) -> list[User]:
        """Who hears about a follow-up coming due.

        The section's admins, as with every other reminder - plus the person
        who scheduled it and whoever owns the lead. Scheduling a call is a
        promise the person making it should be reminded of; targeting only
        section admins meant an Admin could set a follow-up from the lead popup
        and never hear about it again, which is the whole point of setting one.

        follow_up_history is inserted newest-first (LeadService.update), so
        entry zero is whoever set the date currently on the lead.
        """
        recipients = await self._section_admins(lead.section)
        extra_ids = {lead.assigned_to}
        if lead.follow_up_history:
            extra_ids.add(lead.follow_up_history[0].created_by)

        known = {user.id for user in recipients}
        for user_id in extra_ids:
            if user_id is None or user_id in known:
                continue
            user = await self.users.get_by_id(user_id)
            if user and user.is_active:
                recipients.append(user)
                known.add(user.id)
        return recipients

    async def _raise(
        self,
        *,
        user_id: uuid.UUID,
        lead: Lead,
        title: str,
        message: str,
        category: NotificationCategory,
        dedupe_key: str,
    ) -> bool:
        """Creates the notification unless it already exists. Returns whether
        it was actually new.

        The pre-check saves the round trip in the overwhelmingly common case
        (the sweep re-examining a date it has already handled); the
        DuplicateKeyError catch is what actually makes it correct, since two
        workers can pass the pre-check at the same instant.
        """
        if await Notification.find_one({"dedupe_key": dedupe_key}) is not None:
            return False
        try:
            await Notification(
                user_id=user_id,
                title=title,
                message=message,
                type=NotificationType.WARNING,
                lead_id=lead.id,
                category=category,
                dedupe_key=dedupe_key,
            ).insert()
        except DuplicateKeyError:
            return False
        return True

    async def sweep(self) -> int:
        """Raises every reminder that has come due and isn't already raised.
        Returns how many were created."""
        now = utcnow()
        today = now.date()
        created = 0

        for lead in await self.leads.list_due_follow_ups(now=now):
            recipients = await self._follow_up_recipients(lead)
            # Keyed by the due date, not by "today": rescheduling a follow-up
            # to another day is a new promise and earns a new reminder, while
            # the sweep running twenty times before anyone reads it does not.
            due = lead.follow_up_at.date().isoformat()
            for user in recipients:
                created += await self._raise(
                    user_id=user.id,
                    lead=lead,
                    title="Follow-up due today",
                    message=f"{lead.name} was scheduled for a follow-up on {due}. Open to call them.",
                    category=NotificationCategory.FOLLOW_UP_DUE,
                    dedupe_key=f"follow_up:{lead.id}:{due}:{user.id}",
                )

        for lead in await self.leads.list_due_installments(today=today):
            recipients = await self._section_admins(lead.section)
            for index, label in _due_installments(lead, today):
                due = lead.installments[index].scheduled_at.isoformat()
                for user in recipients:
                    created += await self._raise(
                        user_id=user.id,
                        lead=lead,
                        title="Scheduled payment due",
                        message=f"{lead.name}'s {label} was scheduled for {due} and is still unpaid.",
                        category=NotificationCategory.INSTALLMENT_DUE,
                        # Index as well as date: a plan can have two unpaid
                        # installments falling on the same day.
                        dedupe_key=f"installment:{lead.id}:{index}:{due}:{user.id}",
                    )

        if created:
            logger.info("Raised %d due reminder(s).", created)
        return created

    async def sweep_if_due(self) -> None:
        """Sweeps at most once per SWEEP_INTERVAL_SECONDS in this worker.

        Called from the unread-count endpoint, which every section admin's bell
        hits every minute - without the throttle the sweep would run once per
        admin per poll. Failures are logged and swallowed: this rides on a read
        that has its own job to do, and a reminder that can't be raised must
        not take the notification count down with it.
        """
        global _last_sweep_at
        now = datetime.now(timezone.utc)
        if _last_sweep_at is not None and (now - _last_sweep_at).total_seconds() < SWEEP_INTERVAL_SECONDS:
            return
        _last_sweep_at = now
        try:
            await self.sweep()
        except Exception:  # noqa: BLE001 - see docstring
            logger.exception("Reminder sweep failed.")
