import {
  LayoutDashboard,
  Target,
  Megaphone,
  UserPlus,
  ClipboardCheck,
  MessageCircle,
  Wallet,
  Users,
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
// `children` turns an entry into a collapsible parent instead of a link - it has
// no `to` of its own, and is hidden entirely when the user can see none of its
// children. Children are filtered by their own `permission` as usual.
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    to: '/',
    permission: null,
    icon: LayoutDashboard,
    group: null,
    hiddenForRoles: ['Admin', 'Finance', 'HR Coordinator'],
    hiddenForScopedUsers: true,
  },

  {
    label: 'Lead Dashboard',
    to: '/leads',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: Target,
    group: 'Admin',
    hiddenForRoles: ['Finance'],
  },
  {
    label: 'Form Collection',
    to: '/leads/form-collection',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: FileCheck2,
    hiddenForRoles: ['Finance'],
    hiddenForScopedUsers: true,
  },
  {
    label: 'Marketing Board',
    to: '/marketing-board',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: Megaphone,
    hiddenForRoles: ['Admin', 'Finance'],
    hiddenForScopedUsers: true,
  },
  { label: 'Admissions', to: '/admissions', permission: PERMISSIONS.ADMISSIONS_VIEW, icon: UserPlus },

  {
    label: 'Batch Confirmation',
    to: '/batch-confirmation',
    permission: PERMISSIONS.BATCH_CONFIRMATION_VIEW,
    icon: ClipboardCheck,
    group: 'HR Coordinator',
  },
  {
    label: 'WhatsApp Links',
    to: '/whatsapp-links',
    permission: PERMISSIONS.BATCH_CONFIRMATION_VIEW,
    icon: MessageCircle,
  },

  { label: 'Finance', to: '/payments', permission: PERMISSIONS.PAYMENTS_VIEW, icon: Wallet, group: 'Finance' },

  {
    label: 'Employee',
    icon: Users,
    group: 'Administration',
    children: [
      { label: 'Users', to: '/users', permission: PERMISSIONS.USERS_VIEW, icon: UserCog },
      { label: 'Roles', to: '/roles', permission: PERMISSIONS.ROLES_VIEW, icon: ShieldCheck },
    ],
  },
  { label: 'Settings', to: '/settings', permission: PERMISSIONS.SETTINGS_VIEW, icon: Settings },
]

// Every entry that owns a route, with collapsible parents flattened away.
// Use this for path lookups (e.g. the Topbar's page title) - walking NAV_ITEMS
// directly would miss anything nested under a parent.
export const NAV_LEAF_ITEMS = NAV_ITEMS.flatMap((item) => item.children ?? [item])

// One visibility rule, shared by the sidebar and by wherever a user gets sent
// on landing. Keeping these on the same source of truth is what stops a role
// being routed to a page its own sidebar refuses to show.
export function isNavItemVisible(item, { user, hasPermission }) {
  return (
    (!item.permission || hasPermission(item.permission)) &&
    !item.hiddenForRoles?.includes(user?.role) &&
    !(item.hiddenForScopedUsers && user?.scoped_section)
  )
}

export function getVisibleNavItems(context) {
  return NAV_ITEMS.map((item) =>
    item.children ? { ...item, children: item.children.filter((child) => isNavItemVisible(child, context)) } : item,
  ).filter((item) => (item.children ? item.children.length > 0 : isNavItemVisible(item, context)))
}

// The first page this user can actually open - their home. Excludes the
// Dashboard's own "/" so a role that can't see the Dashboard never gets
// redirected back to the route it was just sent away from.
export function getLandingPath(context) {
  const firstOpenable = getVisibleNavItems(context)
    .flatMap((item) => item.children ?? [item])
    .find((item) => item.to && item.to !== '/')
  return firstOpenable?.to ?? null
}
