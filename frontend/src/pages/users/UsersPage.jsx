import { useState } from 'react'
import { Trash2, Users } from 'lucide-react'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { TabStrip } from '@/components/ui/TabStrip'
import { userService } from '@/services/userService'
import { Badge } from '@/components/ui/Badge'
import { AddUserAction, UserFormModal } from '@/components/users/UserFormModal'
import { StaffProfileView } from '@/components/users/StaffProfileView'
import { fullName } from '@/components/users/staffProfile'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/utils/formatters'

const statusBadge = (user) => (
  <Badge tone={user.is_active ? 'green' : 'slate'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
)

// Staff recorded without a login have no email; say so rather than leaving a
// dash that reads as "missing".
const loginEmail = (user) => user.email ?? <span className="text-slate-400">No login</span>

const columns = [
  { key: 'name', header: 'Name', render: fullName },
  { key: 'phone', header: 'Mobile', render: (row) => row.phone ?? '—' },
  { key: 'email', header: 'Email', render: loginEmail },
  { key: 'department', header: 'Department', render: (row) => row.department?.name ?? '—' },
  { key: 'role', header: 'Role', render: (row) => row.role?.name ?? '—' },
  { key: 'is_active', header: 'Status', render: statusBadge },
]

// Deleted users are kept, not erased, so the tab that lists them answers the
// question anybody actually has about a removed account: who took it out, when
// and why. Status is dropped - every row here is deleted, and an Active badge
// on a deleted user reads as a contradiction.
const deletedColumns = [
  { key: 'name', header: 'Name', render: fullName },
  { key: 'email', header: 'Email', render: loginEmail },
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
  const { user: currentUser, hasPermission } = useAuth()
  const [tab, setTab] = useState('active')
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
        // Nothing is created into the Deleted tab. The form is far more than
        // ResourceForm's flat field list - five tabs and a document upload -
        // so it brings its own button and modal.
        renderCreateAction={
          !isDeleted && hasPermission(PERMISSIONS.USERS_CREATE)
            ? ({ onCreated }) => <AddUserAction onCreated={onCreated} />
            : undefined
        }
        rowActions={{
          view: {
            title: fullName,
            maxWidth: 'max-w-3xl',
            renderBody: (user) => (
              <StaffProfileView
                user={user}
                extra={
                  isDeleted
                    ? [
                        { label: 'Deleted', value: formatDateTime(user.deleted_at) },
                        { label: 'Deleted by', value: user.deleted_by_name },
                        { label: 'Reason', value: user.deleted_reason },
                      ]
                    : []
                }
              />
            ),
          },
          // A deleted user is a record to read, not one to work on: editing or
          // re-deleting it would be acting on something that is already gone.
          ...(isDeleted
            ? {}
            : {
                edit: {
                  permission: PERMISSIONS.USERS_UPDATE,
                  render: ({ row, onClose, onSaved }) => (
                    <UserFormModal user={row} onClose={onClose} onSaved={onSaved} />
                  ),
                },
                remove: {
                  permission: PERMISSIONS.USERS_DELETE,
                  describe: (user) => (user.email ? `${fullName(user)} (${user.email})` : fullName(user)),
                  requireReason: true,
                  consequence:
                    'They lose access immediately. The account is kept on the Deleted tab with your reason against it.',
                  lockedReason: (user) => (user.id === currentUser?.id ? 'You cannot delete your own account.' : null),
                },
              }),
        }}
      />
    </>
  )
}
