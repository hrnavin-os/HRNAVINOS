import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { leadService } from '@/services/leadService'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuth } from '@/hooks/useAuth'

const STATUS_TONES = { new: 'blue', contacted: 'amber', qualified: 'amber', negotiation: 'amber', converted: 'green', lost: 'red' }

const SOURCE_OPTIONS = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone_inquiry', label: 'Phone Inquiry' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'other', label: 'Other' },
]

const createFields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'source', label: 'Source', type: 'select', options: SOURCE_OPTIONS },
  { name: 'course_interest', label: 'Course Interest' },
]

function AssignToMeButton({ lead }) {
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => leadService.assign(lead.id, user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  if (!hasPermission(PERMISSIONS.LEADS_ASSIGN) || lead.assigned_to === user.id) return null

  return (
    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      Assign to me
    </Button>
  )
}

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'source', header: 'Source', render: (row) => titleCase(row.source) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
  { key: 'actions', header: '', render: (row) => <AssignToMeButton lead={row} /> },
]

export function LeadsPage() {
  return (
    <ResourceListPage
      title="Leads (CRM)"
      description="Prospective students tracked through the pre-sales pipeline."
      queryKey="leads"
      service={leadService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.LEADS_CREATE}
    />
  )
}
