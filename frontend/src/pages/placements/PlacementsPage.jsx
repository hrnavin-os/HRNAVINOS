import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { placementService } from '@/services/placementService'
import { studentService } from '@/services/studentService'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { applied: 'slate', interview_scheduled: 'blue', selected: 'amber', rejected: 'red', joined: 'green' }

const columns = [
  { key: 'company_name', header: 'Company' },
  { key: 'job_role', header: 'Role' },
  { key: 'package_amount', header: 'Package', render: (row) => (row.package_amount ? formatCurrency(row.package_amount) : '—') },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

export function PlacementsPage() {
  const { data: students, isLoading } = useQuery({
    queryKey: ['students-options'],
    queryFn: () => studentService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    {
      name: 'student_id',
      label: 'Student',
      type: 'select',
      required: true,
      options: (students?.items ?? []).map((student) => ({
        value: student.id,
        label: `${student.first_name} ${student.last_name}`,
      })),
    },
    { name: 'company_name', label: 'Company Name', required: true },
    { name: 'job_role', label: 'Job Role', required: true },
    { name: 'package_amount', label: 'Package Amount', type: 'number' },
  ]

  return (
    <ResourceListPage
      title="Placement"
      description="Student job placement pipeline."
      queryKey="placements"
      service={placementService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.PLACEMENTS_CREATE}
      transformCreatePayload={(values) => ({
        ...values,
        package_amount: values.package_amount ? String(values.package_amount) : undefined,
      })}
    />
  )
}
