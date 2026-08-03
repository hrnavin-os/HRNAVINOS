import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { userService } from '@/services/userService'
import { roleService } from '@/services/roleService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { formatDate, formatDateTime } from '@/utils/formatters'

const fullName = (user) => `${user.first_name} ${user.last_name}`

const statusBadge = (user) => (
  <Badge tone={user.is_active ? 'green' : 'slate'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
)

const columns = [
  { key: 'name', header: 'Name', render: fullName },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Role', render: (row) => row.role?.name ?? '—' },
  { key: 'is_active', header: 'Status', render: statusBadge },
]

export function UsersPage() {
  const { user: currentUser } = useAuth()

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles-options'],
    queryFn: () => roleService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const roleOptions = (roles?.items ?? []).map((role) => ({ value: role.id, label: role.name }))

  const createFields = [
    { name: 'first_name', label: 'First Name', required: true },
    { name: 'last_name', label: 'Last Name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'password', label: 'Temporary Password', type: 'password', required: true },
    { name: 'role_id', label: 'Role', type: 'select', required: true, options: roleOptions },
  ]

  // Email and password are deliberately absent: UserUpdate accepts neither
  // (email is the login identity, password goes through /auth/change-password).
  const editFields = [
    { name: 'first_name', label: 'First Name', required: true },
    { name: 'last_name', label: 'Last Name', required: true },
    { name: 'phone', label: 'Phone' },
    { name: 'role_id', label: 'Role', type: 'select', required: true, options: roleOptions },
    {
      name: 'is_active',
      label: 'Status',
      type: 'select',
      required: true,
      options: [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Inactive' },
      ],
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
      rowActions={{
        view: {
          title: fullName,
          fields: [
            { label: 'Name', value: fullName },
            { label: 'Email', value: (user) => user.email },
            { label: 'Phone', value: (user) => user.phone },
            { label: 'Role', value: (user) => user.role?.name },
            { label: 'Status', value: statusBadge },
            { label: 'Verified', value: (user) => (user.is_verified ? 'Yes' : 'No') },
            { label: 'Last Login', value: (user) => formatDateTime(user.last_login_at) },
            { label: 'Created', value: (user) => formatDate(user.created_at) },
            { label: 'Updated', value: (user) => formatDate(user.updated_at) },
          ],
        },
        edit: {
          title: (user) => `Edit ${fullName(user)}`,
          permission: PERMISSIONS.USERS_UPDATE,
          fields: editFields,
          defaults: (user) => ({
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone ?? '',
            role_id: user.role?.id ?? '',
            is_active: String(user.is_active),
          }),
          // <select> hands back strings; is_active is a bool on UserUpdate.
          transform: (values) => ({ ...values, is_active: values.is_active === 'true' }),
        },
        remove: {
          permission: PERMISSIONS.USERS_DELETE,
          describe: (user) => `${fullName(user)} (${user.email})`,
          lockedReason: (user) =>
            user.id === currentUser?.id ? 'You cannot delete your own account.' : null,
        },
      }}
    />
  )
}
