import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { Badge } from '@/components/ui/Badge'
import { AddUserAction, UserFormModal } from '@/components/users/UserFormModal'
import { StaffProfileView } from '@/components/users/StaffProfileView'
import { fullName } from '@/components/users/staffProfile'
import { staffService } from '@/services/staffService'
import { departmentService } from '@/services/departmentService'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/utils/formatters'

const dash = (value) => value || '—'

const columns = [
  { key: 'employee_code', header: 'Emp ID', render: (row) => dash(row.employment?.employee_code) },
  {
    key: 'name',
    header: 'Name',
    render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{fullName(row)}</p>
        {row.employment?.designation && <p className="text-xs text-slate-500">{row.employment.designation}</p>}
      </div>
    ),
  },
  { key: 'phone', header: 'Mobile', render: (row) => dash(row.phone) },
  { key: 'department', header: 'Department', render: (row) => dash(row.department?.name) },
  { key: 'role', header: 'Role', render: (row) => dash(row.role?.name) },
  {
    key: 'date_of_joining',
    header: 'Joined',
    render: (row) => (row.employment?.date_of_joining ? formatDate(row.employment.date_of_joining) : '—'),
  },
  {
    key: 'is_active',
    header: 'Status',
    render: (row) => <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>,
  },
]

// The staff directory: everybody the Users form has recorded, with every
// section of their profile. The records are the Users menu's, so adding and
// editing here are offered only to a role that holds those users.* codes.
export function StaffsPage() {
  const { hasPermission } = useAuth()
  const [departmentId, setDepartmentId] = useState('')

  const departments = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => departmentService.list({ page_size: 100, sort_by: 'name', sort_order: 'asc' }),
  })
  const departmentOptions = (departments.data?.items ?? []).map((department) => ({
    value: department.id,
    label: department.name,
  }))

  return (
    <ResourceListPage
      title="Staff"
      queryKey="staffs"
      service={staffService}
      columns={columns}
      serialNumber
      extraParams={departmentId ? { department_id: departmentId } : {}}
      renderFilters={() => (
        <FilterDropdown
          label="Department"
          value={departmentId}
          options={departmentOptions}
          onChange={setDepartmentId}
        />
      )}
      renderCreateAction={
        hasPermission(PERMISSIONS.USERS_CREATE) ? ({ onCreated }) => <AddUserAction onCreated={onCreated} /> : undefined
      }
      rowActions={{
        view: {
          title: fullName,
          maxWidth: 'max-w-3xl',
          renderBody: (staff) => <StaffProfileView user={staff} />,
        },
        edit: {
          permission: PERMISSIONS.USERS_UPDATE,
          render: ({ row, onClose, onSaved }) => <UserFormModal user={row} onClose={onClose} onSaved={onSaved} />,
        },
      }}
    />
  )
}
