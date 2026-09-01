"""Central registry of every permission code in the system.

Each code follows the `<module>.<action>` convention. This module is the
single source of truth consumed by the DB seed script (to populate the
`permissions` table) and by route dependencies (`RequirePermissions(...)`).
"""
from enum import StrEnum


class Permissions(StrEnum):
    # ---------- Users ----------
    USERS_VIEW = "users.view"
    USERS_CREATE = "users.create"
    USERS_UPDATE = "users.update"
    USERS_DELETE = "users.delete"

    # ---------- Roles ----------
    ROLES_VIEW = "roles.view"
    ROLES_CREATE = "roles.create"
    ROLES_UPDATE = "roles.update"
    ROLES_DELETE = "roles.delete"

    # ---------- Permissions ----------
    PERMISSIONS_VIEW = "permissions.view"
    PERMISSIONS_CREATE = "permissions.create"
    PERMISSIONS_UPDATE = "permissions.update"
    PERMISSIONS_DELETE = "permissions.delete"

    # ---------- Audit Logs ----------
    AUDIT_LOGS_VIEW = "audit_logs.view"

    # ---------- Leads / CRM ----------
    LEADS_VIEW = "leads.view"
    LEADS_CREATE = "leads.create"
    LEADS_UPDATE = "leads.update"
    LEADS_DELETE = "leads.delete"
    LEADS_ASSIGN = "leads.assign"

    # ---------- Admissions ----------
    ADMISSIONS_VIEW = "admissions.view"
    ADMISSIONS_CREATE = "admissions.create"
    ADMISSIONS_UPDATE = "admissions.update"
    ADMISSIONS_DELETE = "admissions.delete"

    # ---------- Students ----------
    STUDENTS_VIEW = "students.view"
    STUDENTS_CREATE = "students.create"
    STUDENTS_UPDATE = "students.update"
    STUDENTS_DELETE = "students.delete"

    # ---------- Programs ----------
    # The Foundation Form's program dropdown, managed from Admin > Programs.
    PROGRAMS_VIEW = "programs.view"
    PROGRAMS_CREATE = "programs.create"
    PROGRAMS_UPDATE = "programs.update"
    PROGRAMS_DELETE = "programs.delete"

    # ---------- Courses ----------
    COURSES_VIEW = "courses.view"
    COURSES_CREATE = "courses.create"
    COURSES_UPDATE = "courses.update"
    COURSES_DELETE = "courses.delete"

    # ---------- Batches ----------
    BATCHES_VIEW = "batches.view"
    BATCHES_CREATE = "batches.create"
    BATCHES_UPDATE = "batches.update"
    BATCHES_DELETE = "batches.delete"

    # ---------- Batch Confirmation (HR Coordinator) ----------
    BATCH_CONFIRMATION_VIEW = "batch_confirmation.view"
    BATCH_CONFIRMATION_ALLOCATE = "batch_confirmation.allocate"
    BATCH_CONFIRMATION_CONFIRM = "batch_confirmation.confirm"

    # ---------- Tutors ----------
    TUTORS_VIEW = "tutors.view"
    TUTORS_CREATE = "tutors.create"
    TUTORS_UPDATE = "tutors.update"
    TUTORS_DELETE = "tutors.delete"

    # ---------- Attendance ----------
    ATTENDANCE_VIEW = "attendance.view"
    ATTENDANCE_MARK = "attendance.mark"
    ATTENDANCE_UPDATE = "attendance.update"

    # ---------- Payments ----------
    PAYMENTS_VIEW = "payments.view"
    PAYMENTS_CREATE = "payments.create"
    PAYMENTS_VERIFY = "payments.verify"
    PAYMENTS_DELETE = "payments.delete"

    # ---------- Invoices ----------
    INVOICES_VIEW = "invoices.view"
    INVOICES_CREATE = "invoices.create"
    INVOICES_UPDATE = "invoices.update"

    # ---------- Placements ----------
    PLACEMENTS_VIEW = "placements.view"
    PLACEMENTS_CREATE = "placements.create"
    PLACEMENTS_UPDATE = "placements.update"
    PLACEMENTS_DELETE = "placements.delete"

    # ---------- Notifications ----------
    NOTIFICATIONS_VIEW = "notifications.view"
    NOTIFICATIONS_CREATE = "notifications.create"

    # ---------- Tickets ----------
    TICKETS_VIEW = "tickets.view"
    TICKETS_CREATE = "tickets.create"
    TICKETS_UPDATE = "tickets.update"
    TICKETS_ASSIGN = "tickets.assign"

    # ---------- Reports ----------
    REPORTS_VIEW = "reports.view"

    # ---------- Settings ----------
    SETTINGS_VIEW = "settings.view"
    SETTINGS_UPDATE = "settings.update"

    # ---------- Form Collection ----------
    FORM_COLLECTION_CONFIGURE = "form_collection.configure"

    # ---------- Induction Attendance ----------
    # Its own codes rather than the ATTENDANCE_* ones above: those are the
    # classroom register a Tutor marks, and reusing them would hand every tutor
    # the induction programme's board.
    #
    # Split three ways because they are three different jobs: reading where
    # students stand, recording that one attended or signed, and rewriting the
    # terms document itself. The last changes what everybody else is agreeing
    # to, so it is not something to hand out with the register.
    INDUCTION_ATTENDANCE_VIEW = "induction_attendance.view"
    INDUCTION_ATTENDANCE_MARK = "induction_attendance.mark"
    INDUCTION_ATTENDANCE_CONFIGURE = "induction_attendance.configure"


# The modules the role editor offers.
#
# Every code above still exists, is still enforced by its endpoints, and is
# still honoured on any role that already carries it - this list is only about
# what a person is asked to choose from. The ERP carries a dozen modules built
# ahead of the product (admissions, students, courses, batches, tutors, the
# classroom attendance register, placements, invoices, tickets, reports) whose
# pages nothing in the navigation links to. Offering their permissions made the
# picker four screens of choices, most of which grant access to a page the
# grantee cannot reach, and buried the handful that decide what somebody can
# actually do.
#
# Adding a menu means adding its module here. The list is deliberately of
# modules rather than codes: a module that is in the product should offer all
# of its actions, or the picker starts hiding capability rather than noise.
OFFERED_MODULES: set[str] = {
    "leads",
    "form_collection",
    "programs",
    "induction_attendance",
    "batch_confirmation",
    "payments",
    "users",
    "roles",
    # Not a menu of its own: the role editor's own permission list is read
    # through it, so a role that can edit roles and cannot read permissions
    # gets an empty picker.
    "permissions",
    "settings",
}

# Codes inside an offered module that nothing enforces. Granting one changes
# nothing, so offering it is a promise the app does not keep.
UNENFORCED_CODES: set[str] = {"payments.delete"}


def is_offered(code: str) -> bool:
    """Whether the role editor should offer this permission."""
    module = code.split(".", 1)[0]
    return module in OFFERED_MODULES and code not in UNENFORCED_CODES


def all_permission_definitions() -> list[dict[str, str]]:
    """Returns [{code, module, action}, ...] for every permission, derived from the enum."""
    definitions = []
    for perm in Permissions:
        module, action = perm.value.split(".", 1)
        definitions.append({"code": perm.value, "module": module, "action": action})
    return definitions
