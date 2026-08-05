import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { courseService } from '@/services/courseService'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'

const columns = [
  { key: 'name', header: 'Course' },
  { key: 'code', header: 'Code' },
  { key: 'duration_weeks', header: 'Duration', render: (row) => `${row.duration_weeks} weeks` },
  { key: 'fee', header: 'Fee', render: (row) => formatCurrency(row.fee) },
  {
    key: 'is_active',
    header: 'Status',
    render: (row) => <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>,
  },
]

const createFields = [
  { name: 'name', label: 'Course Name', required: true },
  { name: 'code', label: 'Course Code', required: true },
  { name: 'duration_weeks', label: 'Duration (weeks)', type: 'number', required: true },
  { name: 'fee', label: 'Fee', type: 'number', required: true },
]

export function CoursesPage() {
  return (
    <ResourceListPage
      title="Courses"
      queryKey="courses"
      service={courseService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.COURSES_CREATE}
      transformCreatePayload={(values) => ({
        ...values,
        duration_weeks: Number(values.duration_weeks),
        fee: String(values.fee),
      })}
    />
  )
}
