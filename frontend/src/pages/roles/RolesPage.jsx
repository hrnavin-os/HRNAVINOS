import { useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { TabStrip } from '@/components/ui/TabStrip'
import { roleService } from '@/services/roleService'
import { Badge } from '@/components/ui/Badge'
import { AddRoleAction, RoleFormModal } from '@/components/roles/AddRoleAction'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate, formatDateTime } from '@/utils/formatters'

const sectionBadge = (row) =>
  row.scoped_section ? <Badge tone="violet">{row.scoped_section.toUpperCase()}</Badge> : null

const typeBadge = (row) => <Badge tone={row.is_system ? 'blue' : 'slate'}>{row.is_system ? 'System' : 'Custom'}</Badge>

const columns = [
  { key: 'name', header: 'Role' },
  { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
  { key: 'permissions', header: 'Permissions', render: (row) => `${row.permissions.length} granted` },
  { key: 'scoped_section', header: 'Section', render: (row) => sectionBadge(row) ?? '—' },
  { key: 'is_system', header: 'Type', render: typeBadge },
]

// Deleted roles are kept, not erased, so the tab that lists them answers what
// anybody asks about a removed role: who took it out, when, and why.
const deletedColumns = [
  { key: 'name', header: 'Role' },
  { key: 'permissions', header: 'Permissions', render: (row) => `${row.permissions.length} granted` },
  { key: 'deleted_at', header: 'Deleted', render: (row) => formatDateTime(row.deleted_at) },
  { key: 'deleted_by_name', header: 'By', render: (row) => row.deleted_by_name ?? '—' },
  {
    key: 'deleted_reason',
    header: 'Reason',
    render: (row) => (
      <span className="text-slate-700">{row.deleted_reason || <span className="text-slate-400">—</span>}</span>
    ),
  },
]

const TABS = [
  { key: 'active', label: 'Roles', icon: ShieldCheck },
  { key: 'deleted', label: 'Deleted', icon: Trash2 },
]

// The API rejects both update and delete on system roles (role_service.py),
// so lock the buttons rather than letting the click return a 403.
const lockedReason = (row) => (row.is_system ? 'System roles cannot be modified or deleted.' : null)

export function RolesPage() {
  const [tab, setTab] = useState('active')
  const isDeleted = tab === 'deleted'

  return (
    <>
      <div className="mb-3">
        <TabStrip tabs={TABS} value={tab} onChange={setTab} />
      </div>
      {/* Keyed by tab so switching resets the page and search with it. */}
      <ResourceListPage
      key={tab}
      title="Roles"
      queryKey="roles"
      service={roleService}
      columns={isDeleted ? deletedColumns : columns}
      serialNumber
      extraParams={isDeleted ? { deleted: true } : {}}
      renderCreateAction={isDeleted ? undefined : ({ onCreated }) => <AddRoleAction onCreated={onCreated} />}
      rowActions={{
        lockedReason,
        view: {
          title: (row) => row.name,
          fields: [
            { label: 'Role', value: (row) => row.name },
            { label: 'Description', value: (row) => row.description },
            { label: 'Type', value: typeBadge },
            { label: 'Section', value: sectionBadge },
            { label: 'Permissions', value: (row) => `${row.permissions.length} granted` },
            {
              label: 'Granted',
              value: (row) =>
                row.permissions.length ? (
                  <div className="flex flex-wrap gap-1">
                    {row.permissions.map((permission) => (
                      <span
                        key={permission.id}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                      >
                        {permission.code}
                      </span>
                    ))}
                  </div>
                ) : null,
            },
            { label: 'Created', value: (row) => formatDate(row.created_at) },
            { label: 'Updated', value: (row) => formatDate(row.updated_at) },
            ...(isDeleted
              ? [
                  { label: 'Deleted', value: (row) => formatDateTime(row.deleted_at) },
                  { label: 'Deleted by', value: (row) => row.deleted_by_name },
                  { label: 'Reason', value: (row) => row.deleted_reason },
                ]
              : []),
          ],
        },
        // A deleted role is a record to read, not one to work on.
        ...(isDeleted ? {} : {
        edit: {
          permission: PERMISSIONS.ROLES_UPDATE,
          render: ({ row, onClose, onSaved }) => <RoleFormModal role={row} onClose={onClose} onSaved={onSaved} />,
        },
        remove: {
          permission: PERMISSIONS.ROLES_DELETE,
          describe: (row) => `the "${row.name}" role`,
          requireReason: true,
          consequence: 'The role is kept on the Deleted tab with your reason against it. Users who hold it keep their account but lose its permissions.',
        },
        })
      }}
      />
    </>
  )
}
