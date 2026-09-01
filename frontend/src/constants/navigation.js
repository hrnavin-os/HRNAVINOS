import {
  ChartColumn,
  LayoutDashboard,
  Target,
  GraduationCap,
  Bell,
  ClipboardCheck,
  MessageCircle,
  Wallet,
  Users,
  UserCog,
  ShieldCheck,
  Settings,
  FileCheck2,
  ClipboardList,
} from 'lucide-react'
import { PERMISSIONS } from '@/constants/permissions'

// shortLabel: what the mobile bottom bar shows. A tab is about 70px wide, so
// anything longer than one word truncates to nothing useful there ("Batch
// Confirmation" -> "Batch C…"). Omit it and the full label is used.
// permission: null means "visible to any authenticated user"
// hiddenForRoles: role names that should never see this item, regardless of permission
// hiddenForScopedUsers: hide this item for any user whose role carries a scoped_section
// (Section Admins) - section names/roles are open-ended, so this can't be a hiddenForRoles list.
// scopedUsersOnly: the inverse - show the item ONLY to Section Admins.
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
    // The lead analytics board. Sits above Lead Dashboard because it is the
    // summary of what that board holds - you read the shape here and go there
    // for the rows.
    label: 'Dashboard',
    shortLabel: 'Insights',
    to: '/lead-analytics',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: ChartColumn,
    group: 'Admin',
    hiddenForRoles: ['Finance'],
    hiddenForScopedUsers: true,
  },
  {
    label: 'Lead Dashboard',
    shortLabel: 'Leads',
    to: '/leads',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: Target,
    hiddenForRoles: ['Finance'],
  },
  // Section Admins only: payment reminders from Finance are addressed to the
  // admins of a lead's own section, so nobody else has anything to read here.
  // Sits in their group rather than under Administration - that header comes
  // from the Employee entry, which a Section Admin can't see, so the item
  // would have rendered with no heading at all.
  {
    label: 'Notifications',
    to: '/notifications',
    permission: null,
    icon: Bell,
    scopedUsersOnly: true,
  },
  {
    label: 'Form Collection',
    shortLabel: 'Forms',
    to: '/leads/form-collection',
    permission: PERMISSIONS.LEADS_VIEW,
    icon: FileCheck2,
    hiddenForRoles: ['Finance'],
    hiddenForScopedUsers: true,
  },
  {
    // Sits with the other Admin boards rather than under Administration: it is
    // worked daily by whoever is chasing signed forms and marking who turned
    // up, not configured once.
    label: 'Attendance',
    to: '/induction-attendance',
    permission: PERMISSIONS.INDUCTION_ATTENDANCE_VIEW,
    icon: ClipboardList,
    hiddenForScopedUsers: true,
  },
  {
    label: 'Programs',
    to: '/programs',
    permission: PERMISSIONS.PROGRAMS_VIEW,
    icon: GraduationCap,
    hiddenForRoles: ['Finance'],
    hiddenForScopedUsers: true,
  },
  {
    label: 'Batch Confirmation',
    shortLabel: 'Batches',
    to: '/batch-confirmation',
    permission: PERMISSIONS.BATCH_CONFIRMATION_VIEW,
    icon: ClipboardCheck,
    group: 'HR Coordinator',
  },
  {
    label: 'WhatsApp Links',
    shortLabel: 'WhatsApp',
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
    !(item.hiddenForScopedUsers && user?.scoped_section) &&
    // The inverse of hiddenForScopedUsers: shown ONLY to a user whose role
    // carries a scoped_section (a Section Admin).
    !(item.scopedUsersOnly && !user?.scoped_section)
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
