"""Default role -> permission mapping used to seed the database.

Super Admin is granted every permission implicitly by `RequirePermissions`
(see app/core/dependencies.py) and does not need an explicit list here.
"""
from app.permissions.permission_codes import Permissions as P

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "Super Admin": [p.value for p in P],
    "Sales Head": [
        P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE, P.LEADS_DELETE, P.LEADS_ASSIGN,
        P.ADMISSIONS_VIEW, P.USERS_VIEW, P.REPORTS_VIEW,
    ],
    "Pre Sales Executive": [
        P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE,
    ],
    "Post Sales Executive": [
        P.STUDENTS_VIEW, P.STUDENTS_UPDATE, P.TICKETS_VIEW, P.TICKETS_UPDATE, P.NOTIFICATIONS_VIEW,
    ],
    "Admin Head": [
        P.ADMISSIONS_VIEW, P.ADMISSIONS_CREATE, P.ADMISSIONS_UPDATE, P.ADMISSIONS_DELETE,
        P.STUDENTS_VIEW, P.STUDENTS_CREATE, P.STUDENTS_UPDATE, P.STUDENTS_DELETE,
        P.COURSES_VIEW, P.COURSES_CREATE, P.COURSES_UPDATE, P.COURSES_DELETE,
        P.BATCHES_VIEW, P.BATCHES_CREATE, P.BATCHES_UPDATE, P.BATCHES_DELETE,
        P.TUTORS_VIEW, P.TUTORS_CREATE, P.TUTORS_UPDATE, P.TUTORS_DELETE,
        P.USERS_VIEW, P.REPORTS_VIEW, P.SETTINGS_VIEW, P.SETTINGS_UPDATE,
    ],
    "Admin Executive": [
        P.ADMISSIONS_VIEW, P.ADMISSIONS_CREATE, P.ADMISSIONS_UPDATE,
        P.STUDENTS_VIEW, P.STUDENTS_CREATE, P.STUDENTS_UPDATE,
        P.ATTENDANCE_VIEW,
    ],
    "Placement Head": [
        P.PLACEMENTS_VIEW, P.PLACEMENTS_CREATE, P.PLACEMENTS_UPDATE, P.PLACEMENTS_DELETE,
        P.STUDENTS_VIEW, P.REPORTS_VIEW,
    ],
    "Placement Executive": [
        P.PLACEMENTS_VIEW, P.PLACEMENTS_CREATE, P.PLACEMENTS_UPDATE, P.STUDENTS_VIEW,
    ],
    "Finance": [
        P.PAYMENTS_VIEW, P.PAYMENTS_CREATE, P.PAYMENTS_VERIFY,
        P.INVOICES_VIEW, P.INVOICES_CREATE, P.INVOICES_UPDATE,
        P.STUDENTS_VIEW, P.REPORTS_VIEW,
    ],
    "Tutor": [
        P.ATTENDANCE_VIEW, P.ATTENDANCE_MARK, P.ATTENDANCE_UPDATE,
        P.BATCHES_VIEW, P.STUDENTS_VIEW,
    ],
    "Student": [
        P.NOTIFICATIONS_VIEW, P.TICKETS_VIEW, P.TICKETS_CREATE,
    ],
}

SYSTEM_ROLES = {"Super Admin"}
