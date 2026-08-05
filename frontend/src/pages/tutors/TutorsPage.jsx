import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { tutorService } from '@/services/tutorService'
import { userService } from '@/services/userService'
import { Badge } from '@/components/ui/Badge'
import { formatDate, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const columns = [
  { key: 'specialization', header: 'Specialization' },
  { key: 'joining_date', header: 'Joined', render: (row) => formatDate(row.joining_date) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={row.status === 'active' ? 'green' : 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

export function TutorsPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => userService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    {
      name: 'user_id',
      label: 'User Account',
      type: 'select',
      required: true,
      options: (users?.items ?? []).map((user) => ({ value: user.id, label: `${user.first_name} ${user.last_name} (${user.email})` })),
    },
    { name: 'specialization', label: 'Specialization', required: true },
    { name: 'joining_date', label: 'Joining Date', type: 'date', required: true },
  ]

  return (
    <ResourceListPage
      title="Tutors"
      queryKey="tutors"
      service={tutorService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.TUTORS_CREATE}
    />
  )
}
