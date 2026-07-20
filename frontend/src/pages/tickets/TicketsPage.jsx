import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { ticketService } from '@/services/ticketService'
import { Badge } from '@/components/ui/Badge'
import { titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'

const STATUS_TONES = { open: 'blue', in_progress: 'amber', resolved: 'green', closed: 'slate' }
const PRIORITY_TONES = { low: 'slate', medium: 'blue', high: 'amber', urgent: 'red' }

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const columns = [
  { key: 'subject', header: 'Subject' },
  { key: 'category', header: 'Category', render: (row) => row.category ?? '—' },
  {
    key: 'priority',
    header: 'Priority',
    render: (row) => <Badge tone={PRIORITY_TONES[row.priority] ?? 'slate'}>{titleCase(row.priority)}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

const createFields = [
  { name: 'subject', label: 'Subject', required: true },
  { name: 'description', label: 'Description', required: true },
  { name: 'category', label: 'Category' },
  { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
]

export function TicketsPage() {
  return (
    <ResourceListPage
      title="Tickets"
      description="Help-desk requests raised by staff and students."
      queryKey="tickets"
      service={ticketService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.TICKETS_CREATE}
    />
  )
}
