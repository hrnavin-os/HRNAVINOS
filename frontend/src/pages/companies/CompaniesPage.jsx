import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { companyService } from '@/services/companyService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'

const columns = [
  { key: 'name', header: 'Company' },
  { key: 'industry', header: 'Industry', render: (row) => row.industry ?? '—' },
  { key: 'contact_person', header: 'Contact', render: (row) => row.contact_person ?? '—' },
  { key: 'contact_email', header: 'Email', render: (row) => row.contact_email ?? '—' },
  {
    key: 'is_active',
    header: 'Status',
    render: (row) => <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>,
  },
]

const createFields = [
  { name: 'name', label: 'Company Name', required: true },
  { name: 'industry', label: 'Industry' },
  { name: 'contact_person', label: 'Contact Person' },
  { name: 'contact_email', label: 'Contact Email', type: 'email' },
  { name: 'contact_phone', label: 'Contact Phone' },
  { name: 'website', label: 'Website' },
]

export function CompaniesPage() {
  return (
    <ResourceListPage
      title="Companies"
      description="Placement partner organizations."
      queryKey="companies"
      service={companyService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.PLACEMENTS_CREATE}
    />
  )
}
