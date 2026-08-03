import {
  LayoutDashboard,
  Target,
  Megaphone,
  UserPlus,
  Wallet,
  UserCog,
  ShieldCheck,
  Settings,
  FileCheck2,
} from 'lucide-react'
import { PERMISSIONS } from '@/constants/permissions'

// permission: null means "visible to any authenticated user"
// hiddenForRoles: role names that should never see this item, regardless of permission
// hiddenForScopedUsers: hide this item for any user whose role carries a scoped_section
// (Section Admins) - section names/roles are open-ended, so this can't be a hiddenForRoles list.
// Grouped for the sidebar; `group` labels a section header (omit to continue the previous group).
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: '/',
    permission: null,
    icon: LayoutDashboard,
    group: null,
    hiddenForRoles: ['Admin'],
    hiddenForScopedUsers: true,
  },

  {
    label: 'Lead Dashboard',
    to: '/leads',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: Target,
    group: 'Admin',
  },
  {
    label: 'Form Collection',
    to: '/leads/form-collection',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: FileCheck2,
    hiddenForScopedUsers: true,
  },
  { label: 'Marketing Board', to: '/marketing-board', permission: PERMISSIONS.LEADS_VIEW, icon: Megaphone, hiddenForRoles: ['Admin'], hiddenForScopedUsers: true },
  { label: 'Admissions', to: '/admissions', permission: PERMISSIONS.ADMISSIONS_VIEW, icon: UserPlus },

  { label: 'Payments', to: '/payments', permission: PERMISSIONS.PAYMENTS_VIEW, icon: Wallet, group: 'Finance' },

  { label: 'Users', to: '/users', permission: PERMISSIONS.USERS_VIEW, icon: UserCog, group: 'Administration' },
  { label: 'Roles', to: '/roles', permission: PERMISSIONS.ROLES_VIEW, icon: ShieldCheck },
  { label: 'Settings', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW, icon: Settings },
]
