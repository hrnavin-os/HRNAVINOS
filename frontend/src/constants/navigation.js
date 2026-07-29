import {
  LayoutDashboard,
  Target,
  Megaphone,
  UserPlus,
  Users,
  BookOpen,
  CalendarRange,
  GraduationCap,
  ClipboardCheck,
  Wallet,
  Briefcase,
  Building2,
  LifeBuoy,
  BarChart3,
  UserCog,
  ShieldCheck,
  Settings,
  FileCheck2,
} from 'lucide-react'
import { PERMISSIONS } from '@/constants/permissions'

// permission: null means "visible to any authenticated user"
// hiddenForRoles: role names that should never see this item, regardless of permission
// Grouped for the sidebar; `group` labels a section header (omit to continue the previous group).
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: '/',
    permission: null,
    icon: LayoutDashboard,
    group: null,
    hiddenForRoles: ['Admin'],
  },

  {
    label: 'Admin',
    to: '/leads',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: Target,
    group: 'CRM & Admissions',
    hideGroupForRoles: ['Admin'],
  },
  { label: 'Foundation Form', to: '/leads/foundation-form', permission: PERMISSIONS.LEADS_VIEW, icon: FileCheck2 },
  { label: 'Marketing Board', to: '/marketing-board', permission: PERMISSIONS.LEADS_VIEW, icon: Megaphone },
  { label: 'Admissions', to: '/admissions', permission: PERMISSIONS.ADMISSIONS_VIEW, icon: UserPlus },

  { label: 'Students', to: '/students', permission: PERMISSIONS.STUDENTS_VIEW, icon: Users, group: 'Academics' },
  { label: 'Courses', to: '/courses', permission: PERMISSIONS.COURSES_VIEW, icon: BookOpen },
  { label: 'Batches', to: '/batches', permission: PERMISSIONS.BATCHES_VIEW, icon: CalendarRange },
  { label: 'Tutors', to: '/tutors', permission: PERMISSIONS.TUTORS_VIEW, icon: GraduationCap },
  { label: 'Attendance', to: '/attendance', permission: PERMISSIONS.ATTENDANCE_VIEW, icon: ClipboardCheck },

  { label: 'Payments', to: '/payments', permission: PERMISSIONS.PAYMENTS_VIEW, icon: Wallet, group: 'Finance' },

  { label: 'Placement', to: '/placements', permission: PERMISSIONS.PLACEMENTS_VIEW, icon: Briefcase, group: 'Placement' },
  { label: 'Companies', to: '/companies', permission: PERMISSIONS.PLACEMENTS_VIEW, icon: Building2 },

  { label: 'Tickets', to: '/tickets', permission: PERMISSIONS.TICKETS_VIEW, icon: LifeBuoy, group: 'Support & Insights' },
  { label: 'Reports', to: '/reports', permission: PERMISSIONS.REPORTS_VIEW, icon: BarChart3 },

  { label: 'Users', to: '/users', permission: PERMISSIONS.USERS_VIEW, icon: UserCog, group: 'Administration' },
  { label: 'Roles', to: '/roles', permission: PERMISSIONS.ROLES_VIEW, icon: ShieldCheck },
  { label: 'Settings', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW, icon: Settings },
]
