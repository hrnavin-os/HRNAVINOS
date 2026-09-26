"""Default role -> permission mapping used to seed the database.

Super Admin is granted every permission implicitly by `RequirePermissions`
(see app/core/dependencies.py) and does not need an explicit list here.
"""
from app.permissions.permission_codes import Permissions as P

# One list for all three Section Admin roles - they differ only in which
# section Role.scoped_section pins them to.
SECTION_ADMIN_PERMISSIONS: list[str] = [
    # LEADS_CREATE is the walk-in and phone-enquiry case, which is theirs more
    # than anybody's: they are the ones on the call. It doesn't widen their
    # reach - LeadService.create forces the new lead into their own section
    # from Role.scoped_section, whatever the client sends.
    P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE,
    # Their Polls menu: the attendance board's poll marker, narrowed to their
    # own section by the routes and limited to that one marker (see
    # SCOPED_MARKERS). Not CONFIGURE - the terms wording is shared by every
    # section.
    P.INDUCTION_ATTENDANCE_VIEW, P.INDUCTION_ATTENDANCE_MARK,
    # Batch Confirmation's Group Onboarding and Lost Students tabs, on their
    # own section's students only. Not CONFIRM, and the classroom-allocation
    # endpoints refuse a scoped actor outright - a batch's roster spans every
    # section.
    P.BATCH_CONFIRMATION_VIEW, P.BATCH_CONFIRMATION_ALLOCATE,
    # Their own section's group link, and no other section's.
    P.WHATSAPP_LINKS_VIEW,
    # Not Notifications: Finance's payment reminders still reach them through
    # the header bell, which every role has.
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "Super Admin": [p.value for p in P],
    # The institute overview is the landing page for every role that isn't
    # scoped to boards of its own. The Admin team, Finance and the HR
    # Coordinator land on their own boards instead, so they aren't granted it.
    "Sales Head": [
        P.DASHBOARD_VIEW,
        P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE, P.LEADS_DELETE, P.LEADS_ASSIGN,
        # The two lead menus that used to ride along on LEADS_VIEW and now have
        # codes of their own.
        P.LEAD_ANALYTICS_VIEW, P.FORM_COLLECTION_VIEW,
        P.ADMISSIONS_VIEW, P.USERS_VIEW, P.REPORTS_VIEW,
    ],
    # Section Admins (Admin team): Lead Dashboard | Polls | Batch Confirmation
    # | WhatsApp Links, each narrowed to their own section by
    # Role.scoped_section below - the routes read the section off the role, so
    # there is no parameter that could widen it. See SECTION_ADMIN_PERMISSIONS.
    "A-Section Admin": SECTION_ADMIN_PERMISSIONS,
    "B-Section Admin": SECTION_ADMIN_PERMISSIONS,
    "C-Section Admin": SECTION_ADMIN_PERMISSIONS,
    # Owns the hand-off from CRM to classroom: allocates leads that reached the
    # Batch Confirmation stage into batches, then confirms the roster (which
    # creates the Student and Admission records) once the batch is ready.
    "HR Coordinator": [
        P.BATCH_CONFIRMATION_VIEW, P.BATCH_CONFIRMATION_ALLOCATE, P.BATCH_CONFIRMATION_CONFIRM,
        # The WhatsApp Links menu, which used to ride along on
        # BATCH_CONFIRMATION_VIEW: setting the group link every incoming
        # student is sent is this role's job too.
        P.WHATSAPP_LINKS_VIEW,
        # Forming the batch groups is the coordinator's own job, so they create
        # and adjust batches rather than waiting on Admin Head to make one.
        P.BATCHES_VIEW, P.BATCHES_CREATE, P.BATCHES_UPDATE,
        P.LEADS_VIEW, P.COURSES_VIEW, P.TUTORS_VIEW,
        P.STUDENTS_VIEW, P.ADMISSIONS_VIEW, P.REPORTS_VIEW,
    ],
    "Post Sales Executive": [
        P.DASHBOARD_VIEW,
        P.STUDENTS_VIEW, P.STUDENTS_UPDATE, P.TICKETS_VIEW, P.TICKETS_UPDATE, P.NOTIFICATIONS_VIEW,
    ],
    # Leads the Admin team: the whole Admin group of the sidebar - Statistics,
    # Lead Dashboard, Form Collection, Attendance, Programs and its Settings
    # (the Google Sheets export). What the "Admin" role held before the team's
    # roles were aligned (see RETIRED_ADMIN_ROLE below).
    "Admin Head": [
        P.LEADS_VIEW, P.LEADS_CREATE, P.LEADS_UPDATE,
        P.LEAD_ANALYTICS_VIEW, P.FORM_COLLECTION_VIEW, P.FORM_COLLECTION_CONFIGURE,
        # The whole induction Attendance board, including the terms wording.
        P.INDUCTION_ATTENDANCE_VIEW, P.INDUCTION_ATTENDANCE_MARK, P.INDUCTION_ATTENDANCE_CONFIGURE,
        # Programs drive the public form's program dropdown, which is the same
        # surface FORM_COLLECTION_CONFIGURE already lets this role shape.
        P.PROGRAMS_VIEW, P.PROGRAMS_CREATE, P.PROGRAMS_UPDATE, P.PROGRAMS_DELETE,
        # The Settings menu under Programs: the spreadsheet the Induction and
        # Foundation boards are mirrored into. This role owns both boards, so
        # it owns the copy of them that leaves the app.
        P.SHEET_EXPORT_VIEW, P.SHEET_EXPORT_UPDATE,
    ],
    # Works the Attendance board across every section: Terms & Conditions,
    # Polls, Success Meet and Foundation Class. Owns the terms wording too,
    # since chasing the signatures on it is this role's job.
    "Attendance Coordinator": [
        P.INDUCTION_ATTENDANCE_VIEW, P.INDUCTION_ATTENDANCE_MARK, P.INDUCTION_ATTENDANCE_CONFIGURE,
    ],
    # Reads the Statistics board and nothing else: its Induction half is the
    # lead analysis, its Foundation half (collected, payment method, payment
    # remarks) the finance analysis.
    "Operation Coordinator": [
        P.LEAD_ANALYTICS_VIEW,
    ],
    "Admin Executive": [
        P.DASHBOARD_VIEW,
        P.ADMISSIONS_VIEW, P.ADMISSIONS_CREATE, P.ADMISSIONS_UPDATE,
        P.STUDENTS_VIEW, P.STUDENTS_CREATE, P.STUDENTS_UPDATE,
        P.ATTENDANCE_VIEW,
    ],
    "Placement Head": [
        P.DASHBOARD_VIEW,
        P.PLACEMENTS_VIEW, P.PLACEMENTS_CREATE, P.PLACEMENTS_UPDATE, P.PLACEMENTS_DELETE,
        P.STUDENTS_VIEW, P.REPORTS_VIEW,
    ],
    "Placement Executive": [
        P.DASHBOARD_VIEW,
        P.PLACEMENTS_VIEW, P.PLACEMENTS_CREATE, P.PLACEMENTS_UPDATE, P.STUDENTS_VIEW,
    ],
    "Finance": [
        P.PAYMENTS_VIEW, P.PAYMENTS_CREATE, P.PAYMENTS_VERIFY,
        P.INVOICES_VIEW, P.INVOICES_CREATE, P.INVOICES_UPDATE,
        P.STUDENTS_VIEW, P.REPORTS_VIEW,
        P.LEADS_VIEW, P.LEADS_UPDATE,
    ],
    "Tutor": [
        P.DASHBOARD_VIEW,
        P.ATTENDANCE_VIEW, P.ATTENDANCE_MARK, P.ATTENDANCE_UPDATE,
        P.BATCHES_VIEW, P.STUDENTS_VIEW,
    ],
    "Student": [
        P.DASHBOARD_VIEW,
        P.NOTIFICATIONS_VIEW, P.TICKETS_VIEW, P.TICKETS_CREATE,
    ],
}

SYSTEM_ROLES = {"Super Admin"}

# The Admin team. Their definitions above are exact rather than a floor: the
# one-time alignment in app/database/backfills.py sets each live role to
# precisely its list, taking away what the old designations carried.
ADMIN_TEAM_ROLES = [
    "Admin Head",
    "A-Section Admin",
    "B-Section Admin",
    "C-Section Admin",
    "Attendance Coordinator",
    "Operation Coordinator",
]

# Folded into Admin Head by that alignment: its members move across and the
# role itself is retired.
RETIRED_ADMIN_ROLE = "Admin"

# Which Form Collection section (if any) a role's members are restricted to -
# an open-ended section code (not a closed enum; admins can add new sections
# from the Form Collection page). Absent/None for every other role = unscoped,
# sees every lead.
ROLE_SCOPED_SECTION: dict[str, str] = {
    "A-Section Admin": "a",
    "B-Section Admin": "b",
    "C-Section Admin": "c",
}


# The Admin team's designations, as the role editor offers them: pick one and
# its permissions are ticked for you. Section Admin is one designation behind
# three roles - which section is the role's own choice, so the editor asks for
# it. `roles` names the seeded roles that carry each designation, which is also
# what gives those roles their description.
ADMIN_TEAM_DESIGNATIONS: list[dict] = [
    {
        "key": "admin_head",
        "name": "Admin Head",
        "description": "Statistics, Lead Dashboard, Form Collection, Attendance, Programs and Settings.",
        "permission_codes": DEFAULT_ROLE_PERMISSIONS["Admin Head"],
        "section_scoped": False,
        "roles": ["Admin Head"],
    },
    {
        "key": "section_admin",
        "name": "Section Admin",
        "description": "Lead Dashboard, Polls, Batch Confirmation and WhatsApp Links - for their own section only.",
        "permission_codes": SECTION_ADMIN_PERMISSIONS,
        "section_scoped": True,
        "roles": ["A-Section Admin", "B-Section Admin", "C-Section Admin"],
    },
    {
        "key": "attendance_coordinator",
        "name": "Attendance Coordinator",
        "description": "Attendance: Terms & Conditions, Polls, Success Meet and Foundation Class.",
        "permission_codes": DEFAULT_ROLE_PERMISSIONS["Attendance Coordinator"],
        "section_scoped": False,
        "roles": ["Attendance Coordinator"],
    },
    {
        "key": "operation_coordinator",
        "name": "Operation Coordinator",
        "description": "Statistics: lead analysis and finance analysis.",
        "permission_codes": DEFAULT_ROLE_PERMISSIONS["Operation Coordinator"],
        "section_scoped": False,
        "roles": ["Operation Coordinator"],
    },
]
