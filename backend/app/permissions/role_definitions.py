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
    "Admin": [
        P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE, P.FORM_COLLECTION_CONFIGURE,
        # Programs drive the public form's program dropdown, which is the same
        # surface FORM_COLLECTION_CONFIGURE already lets this role shape.
        P.PROGRAMS_VIEW, P.PROGRAMS_CREATE, P.PROGRAMS_UPDATE, P.PROGRAMS_DELETE,
    ],
    # Form Collection Section Admins: manage leads within their own section
    # only (enforced via Role.scoped_section below), no rights to edit the
    # shared form/pricing structure itself - that's Admin/Super Admin only.
    "A-Section Admin": [P.LEADS_VIEW, P.LEADS_UPDATE],
    "B-Section Admin": [P.LEADS_VIEW, P.LEADS_UPDATE],
    "C-Section Admin": [P.LEADS_VIEW, P.LEADS_UPDATE],
    # Owns the hand-off from CRM to classroom: allocates leads that reached the
    # Batch Confirmation stage into batches, then confirms the roster (which
    # creates the Student and Admission records) once the batch is ready.
    "HR Coordinator": [
        P.BATCH_CONFIRMATION_VIEW, P.BATCH_CONFIRMATION_ALLOCATE, P.BATCH_CONFIRMATION_CONFIRM,
        # Forming the batch groups is the coordinator's own job, so they create
        # and adjust batches rather than waiting on Admin Head to make one.
        P.BATCHES_VIEW, P.BATCHES_CREATE, P.BATCHES_UPDATE,
        P.LEADS_VIEW, P.COURSES_VIEW, P.TUTORS_VIEW,
        P.STUDENTS_VIEW, P.ADMISSIONS_VIEW, P.REPORTS_VIEW,
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
        P.LEADS_VIEW, P.LEADS_UPDATE,
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

# Which Form Collection section (if any) a role's members are restricted to -
# an open-ended section code (not a closed enum; admins can add new sections
# from the Form Collection page). Absent/None for every other role = unscoped,
# sees every lead.
ROLE_SCOPED_SECTION: dict[str, str] = {
    "A-Section Admin": "a",
    "B-Section Admin": "b",
    "C-Section Admin": "c",
}
