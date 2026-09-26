import { titleCase } from '@/utils/formatters'

// How the role editor names each permission: by the menu it opens and what it
// lets somebody do there, rather than by its code. "lead_analytics.view" is
// the Statistics page; nobody granting it should have to know that.
//
// Grouped and ordered the way the sidebar is (constants/navigation.js), so the
// picker reads top to bottom like the menus the role will end up seeing. A
// module missing from here still shows - under its own name, in "Other" - so a
// new permission is never hidden by this file being behind.
export const PERMISSION_MENUS = [
  { module: 'dashboard', group: 'Overview', label: 'Dashboard' },

  { module: 'lead_analytics', group: 'Admin', label: 'Statistics', hint: 'The Induction and Foundation boards - the lead analysis.' },
  {
    module: 'finance_analytics',
    label: 'Statistics › Finance',
    hint: 'Collections, dues and overdue EMIs, and following repayments up: reminders to section admins, reporting non-payment to HR, marking Lost.',
  },
  {
    module: 'leads',
    label: 'Lead Dashboard',
    actions: { create: 'Add leads', update: 'Edit leads', delete: 'Delete leads', assign: 'Assign leads' },
  },
  { module: 'form_collection', label: 'Form Collection', actions: { configure: 'Edit the forms' } },
  {
    module: 'induction_attendance',
    label: 'Attendance & Polls',
    hint: 'Terms & Conditions, Polls, Success Meet and Foundation Class. A role restricted to a section gets its Polls menu only.',
    actions: { mark: 'Mark attendance', configure: 'Edit terms wording' },
  },
  { module: 'programs', label: 'Programs', actions: { create: 'Add', update: 'Edit', delete: 'Delete' } },
  { module: 'sheet_export', label: 'Settings (Google Sheets)', actions: { update: 'Change' } },

  {
    module: 'batch_confirmation',
    group: 'Onboarding',
    label: 'Batch Confirmation',
    hint: 'A role restricted to a section works its own section only, and cannot allocate or confirm batches.',
    actions: { allocate: 'Work onboarding', confirm: 'Confirm batches' },
  },
  { module: 'whatsapp_links', label: 'WhatsApp Links', actions: { view: 'View and set links' } },
  { module: 'notifications', label: 'Notifications', actions: { create: 'Send' } },

  { module: 'payments', group: 'Finance', label: 'Finance', actions: { create: 'Record payments', verify: 'Verify payments' } },

  {
    module: 'staffs',
    group: 'Administration',
    label: 'Employee › Staffs',
    hint: 'The staff directory, bank and ID details included. Adding and editing staff comes with Users.',
  },
  {
    module: 'departments',
    label: 'Employee › Departments',
    actions: { create: 'Add', update: 'Edit', delete: 'Delete' },
  },
  { module: 'roles', label: 'Employee › Roles', actions: { create: 'Add', update: 'Edit', delete: 'Delete' } },
  {
    module: 'users',
    label: 'Employee › Users',
    actions: { create: 'Add', update: 'Edit', delete: 'Delete' },
  },
  {
    module: 'permissions',
    label: 'Permission list',
    hint: 'Needed alongside Roles, or the role editor has no permissions to offer.',
    actions: { create: 'Add', update: 'Edit', delete: 'Delete' },
  },
  { module: 'settings', label: 'Administration › Settings', actions: { update: 'Change' } },
]

// Each entry carries its sidebar group; one that omits `group` continues the
// previous entry's, as in NAV_ITEMS.
const MENU_BY_MODULE = (() => {
  let group = null
  return Object.fromEntries(
    PERMISSION_MENUS.map((menu, order) => {
      group = menu.group ?? group
      return [menu.module, { ...menu, group, order }]
    }),
  )
})()

export function menuFor(module) {
  return MENU_BY_MODULE[module] ?? { module, group: 'Other', label: titleCase(module), order: Infinity }
}

export function actionLabel(permission) {
  if (permission.action === 'view') return menuFor(permission.module).actions?.view ?? 'View'
  return menuFor(permission.module).actions?.[permission.action] ?? titleCase(permission.action)
}

// "Statistics · View" - a permission named for somebody reading a role back.
export function describePermission(permission) {
  return `${menuFor(permission.module).label} · ${actionLabel(permission)}`
}

// [[group, [[menu, permissions], ...]], ...] in sidebar order, with each
// menu's permissions led by View.
export function groupPermissions(permissions) {
  const byModule = new Map()
  for (const permission of permissions) {
    if (!byModule.has(permission.module)) byModule.set(permission.module, [])
    byModule.get(permission.module).push(permission)
  }
  const menus = [...byModule.entries()]
    .map(([module, items]) => [
      menuFor(module),
      [...items].sort((a, b) => (a.action === 'view' ? -1 : b.action === 'view' ? 1 : 0)),
    ])
    .sort(([a], [b]) => a.order - b.order || a.label.localeCompare(b.label))

  const groups = new Map()
  for (const entry of menus) {
    if (!groups.has(entry[0].group)) groups.set(entry[0].group, [])
    groups.get(entry[0].group).push(entry)
  }
  return [...groups.entries()]
}
