import { PERMISSIONS } from '@/constants/permissions'

// permission: null means "visible to any authenticated user"
export const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', permission: null },
  { label: 'Leads (CRM)', to: '/leads', permission: PERMISSIONS.LEADS_VIEW },
  { label: 'Admissions', to: '/admissions', permission: PERMISSIONS.ADMISSIONS_VIEW },
  { label: 'Students', to: '/students', permission: PERMISSIONS.STUDENTS_VIEW },
  { label: 'Courses', to: '/courses', permission: PERMISSIONS.COURSES_VIEW },
  { label: 'Batches', to: '/batches', permission: PERMISSIONS.BATCHES_VIEW },
  { label: 'Tutors', to: '/tutors', permission: PERMISSIONS.TUTORS_VIEW },
  { label: 'Attendance', to: '/attendance', permission: PERMISSIONS.ATTENDANCE_VIEW },
  { label: 'Payments', to: '/payments', permission: PERMISSIONS.PAYMENTS_VIEW },
  { label: 'Placement', to: '/placements', permission: PERMISSIONS.PLACEMENTS_VIEW },
  { label: 'Tickets', to: '/tickets', permission: PERMISSIONS.TICKETS_VIEW },
  { label: 'Reports', to: '/reports', permission: PERMISSIONS.REPORTS_VIEW },
  { label: 'Users', to: '/users', permission: PERMISSIONS.USERS_VIEW },
  { label: 'Roles', to: '/roles', permission: PERMISSIONS.ROLES_VIEW },
]
