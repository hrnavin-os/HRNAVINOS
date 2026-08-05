import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { roleService } from '@/services/roleService'
import { Badge } from '@/components/ui/Badge'
import { AddRoleAction, RoleFormModal } from '@/components/roles/AddRoleAction'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'

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

// The API rejects both update and delete on system roles (role_service.py),
// so lock the buttons rather than letting the click return a 403.
const lockedReason = (row) => (row.is_system ? 'System roles cannot be modified or deleted.' : null)

export function RolesPage() {
  return (
    <ResourceListPage
      title="Roles"
      queryKey="roles"
      service={roleService}
      columns={columns}
      serialNumber
      renderCreateAction={({ onCreated }) => <AddRoleAction onCreated={onCreated} />}
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
          ],
        },
        edit: {
          permission: PERMISSIONS.ROLES_UPDATE,
          render: ({ row, onClose, onSaved }) => <RoleFormModal role={row} onClose={onClose} onSaved={onSaved} />,
        },
        remove: {
          permission: PERMISSIONS.ROLES_DELETE,
          describe: (row) => `the "${row.name}" role`,
        },
      }}
    />
  )
}
