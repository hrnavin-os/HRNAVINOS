import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'

const dash = <span className="text-slate-400">—</span>
const orDash = (value) => value || dash

// Induction submissions are their own records, not Leads, so this board has
// its own columns rather than reusing the Foundation ones - there is no stage,
// payment plan or query on an induction entry.
//
// No create form: entries arrive through the shareable form in
// Admin > Form Collection. Editing stays available for corrections.
const columns = [
  { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  {
    key: 'contact',
    header: 'Contact',
    render: (row) => (
      <div className="min-w-0">
        <p className="tabular-nums text-slate-700">{row.phone}</p>
        {row.email && <p className="truncate text-xs text-slate-500">{row.email}</p>}
      </div>
    ),
  },
  {
    // Derived server-side from the registration date, so it is never edited
    // and never drifts from it.
    key: 'batch',
    header: 'Batch',
    align: 'center',
    render: (row) => <Badge tone="blue">{row.batch}</Badge>,
  },
  {
    key: 'registration_date',
    header: 'Registration',
    align: 'center',
    render: (row) => formatDate(row.registration_date),
  },
  {
    key: 'paid_date',
    header: 'Paid',
    align: 'center',
    render: (row) => (row.paid_date ? formatDate(row.paid_date) : dash),
  },
  { key: 'sales_person', header: 'Sales Person', render: (row) => orDash(row.sales_person) },
  { key: 'lead_source', header: 'Lead Source', render: (row) => orDash(row.lead_source) },
  { key: 'payment_mode', header: 'Payment Mode', render: (row) => orDash(row.payment_mode) },
  { key: 'category', header: 'Category', render: (row) => orDash(row.category) },
  {
    // Assigned round-robin across Section Admins when the form is submitted.
    key: 'assigned_to',
    header: 'Assigned To',
    render: (row) =>
      row.assigned_to_name ? (
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-slate-900">{row.assigned_to_name}</span>
          {row.section && <Badge tone="violet">{row.section.toUpperCase()}</Badge>}
        </span>
      ) : (
        <span className="text-amber-600">Unassigned</span>
      ),
  },
]

const editFields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone Number', required: true },
  { name: 'registration_date', label: 'Registration Date', type: 'date', required: true },
  { name: 'paid_date', label: 'Paid Date', type: 'date' },
  { name: 'sales_person', label: 'Sales Person' },
  { name: 'lead_source', label: 'Lead Source' },
  { name: 'payment_mode', label: 'Payment Mode' },
  { name: 'category', label: 'Category' },
]

export function InductionLeadsBoard() {
  return (
    <ResourceListPage
      title="Induction Entry"
      queryKey="induction-entries"
      service={inductionEntryService}
      columns={columns}
      serialNumber
      rowActions={{
        view: {
          title: (row) => row.name,
          fields: [
            { label: 'Name', value: (row) => row.name },
            { label: 'Email', value: (row) => row.email },
            { label: 'Phone Number', value: (row) => row.phone },
            { label: 'Batch', value: (row) => <Badge tone="blue">{row.batch}</Badge> },
            { label: 'Registration Date', value: (row) => formatDate(row.registration_date) },
            { label: 'Paid Date', value: (row) => (row.paid_date ? formatDate(row.paid_date) : null) },
            { label: 'Sales Person', value: (row) => row.sales_person },
            { label: 'Lead Source', value: (row) => row.lead_source },
            { label: 'Payment Mode', value: (row) => row.payment_mode },
            { label: 'Category', value: (row) => row.category },
            {
              label: 'Assigned To',
              value: (row) =>
                row.assigned_to_name
                  ? `${row.assigned_to_name}${row.section ? ` (Section ${row.section.toUpperCase()})` : ''}`
                  : 'Unassigned — no active Section Admin to rotate to',
            },
          ],
        },
        edit: {
          title: (row) => `Edit ${row.name}`,
          permission: PERMISSIONS.LEADS_UPDATE,
          fields: editFields,
          // Dates arrive as ISO strings; <input type="date"> wants YYYY-MM-DD,
          // which is the leading 10 characters either way.
          defaults: (row) => ({
            name: row.name,
            email: row.email ?? '',
            phone: row.phone,
            registration_date: row.registration_date?.slice(0, 10) ?? '',
            paid_date: row.paid_date?.slice(0, 10) ?? '',
            sales_person: row.sales_person ?? '',
            lead_source: row.lead_source ?? '',
            payment_mode: row.payment_mode ?? '',
            category: row.category ?? '',
          }),
        },
        remove: {
          permission: PERMISSIONS.LEADS_DELETE,
          describe: (row) => `${row.name} (${row.phone})`,
        },
      }}
    />
  )
}
