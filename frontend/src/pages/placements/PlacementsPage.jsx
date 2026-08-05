import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { placementService } from '@/services/placementService'
import { studentService } from '@/services/studentService'
import { companyService } from '@/services/companyService'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { applied: 'slate', interview_scheduled: 'blue', selected: 'amber', rejected: 'red', joined: 'green' }

export function PlacementsPage() {
  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-options'],
    queryFn: () => studentService.list({ page_size: 100 }),
  })
  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ['companies-options'],
    queryFn: () => companyService.list({ page_size: 100 }),
  })

  if (loadingStudents || loadingCompanies) return <LoadingSpinner />

  const companyNameById = new Map((companies?.items ?? []).map((company) => [company.id, company.name]))

  const columns = [
    { key: 'company_id', header: 'Company', render: (row) => companyNameById.get(row.company_id) ?? '—' },
    { key: 'job_role', header: 'Role' },
    { key: 'package_amount', header: 'Package', render: (row) => (row.package_amount ? formatCurrency(row.package_amount) : '—') },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
    },
  ]

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
    {
      name: 'company_id',
      label: 'Company',
      type: 'select',
      required: true,
      options: (companies?.items ?? []).map((company) => ({ value: company.id, label: company.name })),
    },
    { name: 'job_role', label: 'Job Role', required: true },
    { name: 'package_amount', label: 'Package Amount', type: 'number' },
  ]

  return (
    <ResourceListPage
      title="Placement"
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
