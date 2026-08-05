import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { admissionService } from '@/services/admissionService'
import { studentService } from '@/services/studentService'
import { courseService } from '@/services/courseService'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { pending: 'amber', confirmed: 'green', cancelled: 'red' }

const columns = [
  { key: 'total_fee', header: 'Total Fee', render: (row) => formatCurrency(row.total_fee) },
  { key: 'admission_fee_paid', header: 'Paid', render: (row) => formatCurrency(row.admission_fee_paid) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

export function AdmissionsPage() {
  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-options'],
    queryFn: () => studentService.list({ page_size: 100 }),
  })
  const { data: courses, isLoading: loadingCourses } = useQuery({
    queryKey: ['courses-options'],
    queryFn: () => courseService.list({ page_size: 100 }),
  })

  if (loadingStudents || loadingCourses) return <LoadingSpinner />

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
      name: 'course_id',
      label: 'Course',
      type: 'select',
      required: true,
      options: (courses?.items ?? []).map((course) => ({ value: course.id, label: course.name })),
    },
    { name: 'total_fee', label: 'Total Fee', type: 'number', required: true },
    { name: 'admission_fee_paid', label: 'Amount Paid Now', type: 'number' },
  ]

  return (
    <ResourceListPage
      title="Admissions"
      queryKey="admissions"
      service={admissionService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.ADMISSIONS_CREATE}
      transformCreatePayload={(values) => ({
        ...values,
        total_fee: String(values.total_fee),
        admission_fee_paid: values.admission_fee_paid ? String(values.admission_fee_paid) : '0',
      })}
    />
  )
}
