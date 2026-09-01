import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Users } from 'lucide-react'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { TabStrip } from '@/components/ui/TabStrip'
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

// Deleted users are kept, not erased, so the tab that lists them answers the
// question anybody actually has about a removed account: who took it out, when
// and why. Status is dropped - every row here is deleted, and an Active badge
// on a deleted user reads as a contradiction.
const deletedColumns = [
  { key: 'name', header: 'Name', render: fullName },
  { key: 'email', header: 'Email' },
  { key: 'role', header: 'Role', render: (row) => row.role?.name ?? '—' },
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
  { key: 'active', label: 'Users', icon: Users },
  { key: 'deleted', label: 'Deleted', icon: Trash2 },
]

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const [tab, setTab] = useState('active')

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

  const isDeleted = tab === 'deleted'

  return (
    <>
      <div className="mb-3">
        <TabStrip tabs={TABS} value={tab} onChange={setTab} />
      </div>
      {/* Keyed by tab so switching resets the page and search with it: page 3
          of the live users is not page 3 of the deleted ones. */}
      <ResourceListPage
      key={tab}
      title="Users"
      queryKey="users"
      service={userService}
      columns={isDeleted ? deletedColumns : columns}
      serialNumber
      extraParams={isDeleted ? { deleted: true } : {}}
      createFields={createFields}
      // Nothing is created into the Deleted tab.
      createPermission={isDeleted ? null : PERMISSIONS.USERS_CREATE}
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
            ...(isDeleted
              ? [
                  { label: 'Deleted', value: (user) => formatDateTime(user.deleted_at) },
                  { label: 'Deleted by', value: (user) => user.deleted_by_name },
                  { label: 'Reason', value: (user) => user.deleted_reason },
                ]
              : []),
          ],
        },
        // A deleted user is a record to read, not one to work on: editing or
        // re-deleting it would be acting on something that is already gone.
        ...(isDeleted ? {} : {
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
          requireReason: true,
          consequence: 'They lose access immediately. The account is kept on the Deleted tab with your reason against it.',
          lockedReason: (user) =>
            user.id === currentUser?.id ? 'You cannot delete your own account.' : null,
        },
        })
      }}
      />
    </>
  )
}
