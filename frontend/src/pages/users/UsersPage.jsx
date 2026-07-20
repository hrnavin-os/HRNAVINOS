import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { userService } from '@/services/userService'
import { roleService } from '@/services/roleService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const columns = [
  { key: 'name', header: 'Name', render: (row) => `${row.first_name} ${row.last_name}` },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Role', render: (row) => row.role?.name ?? '—' },
  {
    key: 'is_active',
    header: 'Status',
    render: (row) => <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>,
  },
]

export function UsersPage() {
  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles-options'],
    queryFn: () => roleService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    { name: 'first_name', label: 'First Name', required: true },
    { name: 'last_name', label: 'Last Name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'password', label: 'Temporary Password', type: 'password', required: true },
    {
      name: 'role_id',
      label: 'Role',
      type: 'select',
      required: true,
      options: (roles?.items ?? []).map((role) => ({ value: role.id, label: role.name })),
    },
  ]

  return (
    <ResourceListPage
      title="Users"
      description="Staff and system accounts."
      queryKey="users"
      service={userService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.USERS_CREATE}
    />
  )
}
