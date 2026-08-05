import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { programService } from '@/services/programService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'

const statusBadge = (row) => (
  <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>
)

const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

export function ProgramsPage() {
  // Pricing categories still live on the Foundation Form config singleton, and
  // a program has to name one - it's what decides the payment plans and
  // installment amounts page 2 of the form offers for that program.
  const { data: config, isLoading } = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: () => foundationFormConfigService.get(),
  })

  if (isLoading) return <LoadingSpinner />

  const categories = config?.categories ?? []
  const categoryOptions = categories.map((category) => ({ value: category.code, label: category.label }))
  const categoryLabel = (code) => categories.find((category) => category.code === code)?.label ?? code

  const fields = [
    { name: 'name', label: 'Program Name', required: true },
    { name: 'category', label: 'Pricing Category', type: 'select', required: true, options: categoryOptions },
    { name: 'description', label: 'Description' },
    { name: 'order', label: 'Display Order', type: 'number' },
    { name: 'is_active', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
  ]

  // <select> and <input type=number> both hand back strings; the API wants a
  // real bool and int.
  const normalise = (values) => ({
    ...values,
    order: Number(values.order || 0),
    is_active: values.is_active !== 'false',
  })

  const columns = [
    { key: 'name', header: 'Program' },
    { key: 'category', header: 'Pricing Category', render: (row) => categoryLabel(row.category) },
    {
      key: 'value',
      header: 'Form Value',
      render: (row) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{row.value}</code>,
    },
    { key: 'order', header: 'Order' },
    { key: 'is_active', header: 'Status', render: statusBadge },
  ]

  return (
    <ResourceListPage
      title="Programs"
      description='Options for the form’s "Program you are planning to join?" dropdown.'
      queryKey="programs"
      service={programService}
      columns={columns}
      serialNumber
      createFields={fields}
      createPermission={PERMISSIONS.PROGRAMS_CREATE}
      transformCreatePayload={normalise}
      rowActions={{
        view: {
          title: (row) => row.name,
          fields: [
            { label: 'Program', value: (row) => row.name },
            { label: 'Pricing Category', value: (row) => categoryLabel(row.category) },
            { label: 'Form Value', value: (row) => row.value },
            { label: 'Description', value: (row) => row.description },
            { label: 'Display Order', value: (row) => String(row.order) },
            { label: 'Status', value: statusBadge },
            { label: 'Created', value: (row) => formatDate(row.created_at) },
            { label: 'Updated', value: (row) => formatDate(row.updated_at) },
          ],
        },
        edit: {
          title: (row) => `Edit ${row.name}`,
          permission: PERMISSIONS.PROGRAMS_UPDATE,
          // `value` is deliberately not editable: existing leads store it, so
          // renaming a program changes its display name, not its identity.
          fields,
          defaults: (row) => ({
            name: row.name,
            category: row.category,
            description: row.description ?? '',
            order: String(row.order ?? 0),
            is_active: String(row.is_active),
          }),
          transform: normalise,
        },
        remove: {
          permission: PERMISSIONS.PROGRAMS_DELETE,
          describe: (row) => `the "${row.name}" program`,
        },
      }}
    />
  )
}
