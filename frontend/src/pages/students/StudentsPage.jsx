import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { studentService } from '@/services/studentService'
import { courseService } from '@/services/courseService'
import { Badge } from '@/components/ui/Badge'
import { formatDate, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { active: 'green', on_hold: 'amber', completed: 'blue', dropped: 'red' }

const columns = [
  { key: 'name', header: 'Name', render: (row) => `${row.first_name} ${row.last_name}` },
  { key: 'email', header: 'Email' },
  { key: 'admission_date', header: 'Admitted', render: (row) => formatDate(row.admission_date) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

export function StudentsPage() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses-options'],
    queryFn: () => courseService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    { name: 'first_name', label: 'First Name', required: true },
    { name: 'last_name', label: 'Last Name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone' },
    {
      name: 'course_id',
      label: 'Course',
      type: 'select',
      options: (courses?.items ?? []).map((course) => ({ value: course.id, label: course.name })),
    },
    { name: 'admission_date', label: 'Admission Date', type: 'date', required: true },
  ]

  return (
    <ResourceListPage
      title="Students"
      description="Enrolled learners across all courses."
      queryKey="students"
      service={studentService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.STUDENTS_CREATE}
      transformCreatePayload={(values) => ({ ...values, course_id: values.course_id || undefined })}
    />
  )
}
