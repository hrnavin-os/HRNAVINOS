import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { departmentService } from '@/services/departmentService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'

const statusBadge = (row) => (
  <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>
)

const staffCount = (row) => `${row.staff_count} staff`

const columns = [
  { key: 'name', header: 'Department' },
  { key: 'code', header: 'Code', render: (row) => row.code ?? '—' },
  { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
  { key: 'staff_count', header: 'Staff', render: staffCount },
  { key: 'is_active', header: 'Status', render: statusBadge },
]

// Inactive departments stay on the staff already in them, but the Users form
// stops offering them - the way to retire one that still has people in it.
const STATUS_FIELD = {
  name: 'is_active',
  label: 'Status',
  type: 'select',
  required: true,
  options: [
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' },
  ],
}

const fields = [
  { name: 'name', label: 'Department Name', required: true, validation: { minLength: { value: 2, message: 'At least 2 characters' } } },
  { name: 'code', label: 'Code', placeholder: 'e.g. ADM, FIN' },
  { name: 'description', label: 'Description', type: 'textarea' },
  STATUS_FIELD,
]

// <select> hands back strings; is_active is a bool on the API.
const withBoolean = (values) => ({ ...values, is_active: values.is_active !== 'false' })

export function DepartmentsPage() {
  return (
    <ResourceListPage
      title="Department"
      queryKey="departments"
      service={departmentService}
      columns={columns}
      serialNumber
      extraParams={{ sort_by: 'name', sort_order: 'asc' }}
      createFields={fields}
      createPermission={PERMISSIONS.DEPARTMENTS_CREATE}
      transformCreatePayload={withBoolean}
      rowActions={{
        view: {
          title: (row) => row.name,
          fields: [
            { label: 'Department', value: (row) => row.name },
            { label: 'Code', value: (row) => row.code },
            { label: 'Description', value: (row) => row.description },
            { label: 'Staff', value: staffCount },
            { label: 'Status', value: statusBadge },
            { label: 'Created', value: (row) => formatDate(row.created_at) },
            { label: 'Updated', value: (row) => formatDate(row.updated_at) },
          ],
        },
        edit: {
          title: (row) => `Edit ${row.name}`,
          permission: PERMISSIONS.DEPARTMENTS_UPDATE,
          fields,
          defaults: (row) => ({
            name: row.name,
            code: row.code ?? '',
            description: row.description ?? '',
            is_active: String(row.is_active),
          }),
          // An emptied field is sent as null so the API clears it - leaving it
          // out would keep the old value.
          transform: (values) => ({
            name: values.name,
            code: values.code || null,
            description: values.description || null,
            is_active: values.is_active !== 'false',
          }),
        },
        remove: {
          permission: PERMISSIONS.DEPARTMENTS_DELETE,
          describe: (row) => `the "${row.name}" department`,
          // The API refuses too; this says why before anybody clicks.
          lockedReason: (row) =>
            row.staff_count
              ? `${row.staff_count} staff are in this department. Move them first, or mark it inactive.`
              : null,
        },
      }}
    />
  )
}
