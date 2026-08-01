import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { roleService } from '@/services/roleService'
import { Badge } from '@/components/ui/Badge'
import { AddRoleAction } from '@/components/roles/AddRoleAction'

const columns = [
  { key: 'name', header: 'Role' },
  { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
  { key: 'permissions', header: 'Permissions', render: (row) => `${row.permissions.length} granted` },
  {
    key: 'scoped_section',
    header: 'Section',
    render: (row) => (row.scoped_section ? <Badge tone="violet">{row.scoped_section.toUpperCase()}</Badge> : '—'),
  },
  {
    key: 'is_system',
    header: 'Type',
    render: (row) => <Badge tone={row.is_system ? 'blue' : 'slate'}>{row.is_system ? 'System' : 'Custom'}</Badge>,
  },
]

export function RolesPage() {
  return (
    <ResourceListPage
      title="Roles"
      description="Permission bundles assignable to users."
      queryKey="roles"
      service={roleService}
      columns={columns}
      renderCreateAction={({ onCreated }) => <AddRoleAction onCreated={onCreated} />}
    />
  )
}
