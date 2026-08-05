import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { batchService } from '@/services/batchService'
import { courseService } from '@/services/courseService'
import { Badge } from '@/components/ui/Badge'
import { formatDate, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { upcoming: 'blue', ongoing: 'green', completed: 'slate', cancelled: 'red' }

const columns = [
  { key: 'name', header: 'Batch' },
  { key: 'start_date', header: 'Start', render: (row) => formatDate(row.start_date) },
  { key: 'end_date', header: 'End', render: (row) => formatDate(row.end_date) },
  { key: 'capacity', header: 'Capacity' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

export function BatchesPage() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses-options'],
    queryFn: () => courseService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    {
      name: 'course_id',
      label: 'Course',
      type: 'select',
      required: true,
      options: (courses?.items ?? []).map((course) => ({ value: course.id, label: course.name })),
    },
    { name: 'name', label: 'Batch Name', required: true },
    { name: 'start_date', label: 'Start Date', type: 'date', required: true },
    { name: 'end_date', label: 'End Date', type: 'date', required: true },
    { name: 'capacity', label: 'Capacity', type: 'number', required: true },
  ]

  return (
    <ResourceListPage
      title="Batches"
      queryKey="batches"
      service={batchService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.BATCHES_CREATE}
      transformCreatePayload={(values) => ({ ...values, capacity: Number(values.capacity) })}
    />
  )
}
