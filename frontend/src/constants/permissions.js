// Mirrors backend/app/permissions/permission_codes.py — keep in sync.
export const PERMISSIONS = {
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',

  PERMISSIONS_VIEW: 'permissions.view',

  AUDIT_LOGS_VIEW: 'audit_logs.view',

  LEADS_VIEW: 'leads.view',
  LEADS_CREATE: 'leads.create',
  LEADS_UPDATE: 'leads.update',
  LEADS_ASSIGN: 'leads.assign',

  ADMISSIONS_VIEW: 'admissions.view',
  ADMISSIONS_CREATE: 'admissions.create',

  STUDENTS_VIEW: 'students.view',
  STUDENTS_CREATE: 'students.create',
  STUDENTS_UPDATE: 'students.update',
  STUDENTS_DELETE: 'students.delete',

  COURSES_VIEW: 'courses.view',
  COURSES_CREATE: 'courses.create',
  COURSES_UPDATE: 'courses.update',
  COURSES_DELETE: 'courses.delete',

  BATCHES_VIEW: 'batches.view',
  BATCHES_CREATE: 'batches.create',

  TUTORS_VIEW: 'tutors.view',
  TUTORS_CREATE: 'tutors.create',

  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',

  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_VERIFY: 'payments.verify',

  INVOICES_VIEW: 'invoices.view',

  PLACEMENTS_VIEW: 'placements.view',
  PLACEMENTS_CREATE: 'placements.create',

  NOTIFICATIONS_VIEW: 'notifications.view',

  TICKETS_VIEW: 'tickets.view',
  TICKETS_CREATE: 'tickets.create',

  REPORTS_VIEW: 'reports.view',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  FORM_COLLECTION_CONFIGURE: 'form_collection.configure',
}
