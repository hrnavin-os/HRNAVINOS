import { Building2, Contact, ShieldCheck, UserCog } from 'lucide-react'
import { PERMISSIONS } from '@/constants/permissions'

// The four tabs of the Employee page, in order. One list for both the page
// that draws them and the sidebar entry that opens it (navigation.js), so the
// Employee link is shown exactly when at least one tab would be.
//
// Staffs first - the directory of everybody the Users form has recorded - then
// Departments and Roles, since every user must be given one of each, and Users
// itself last.
export const EMPLOYEE_TABS = [
  { key: 'staffs', label: 'Staffs', icon: Contact, permission: PERMISSIONS.STAFFS_VIEW },
  { key: 'departments', label: 'Departments', icon: Building2, permission: PERMISSIONS.DEPARTMENTS_VIEW },
  { key: 'roles', label: 'Roles', icon: ShieldCheck, permission: PERMISSIONS.ROLES_VIEW },
  { key: 'users', label: 'Users', icon: UserCog, permission: PERMISSIONS.USERS_VIEW },
]
