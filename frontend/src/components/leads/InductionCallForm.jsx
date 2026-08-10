import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { Badge } from '@/components/ui/Badge'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'
import {
  CATEGORY_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  PAYMENT_MODE_OPTIONS,
  SALES_PERSON_OPTIONS,
} from '@/constants/inductionOptions'

const dash = <span className="text-slate-400">—</span>
const orDash = (value) => value || dash

// Batch is computed by the backend from registration_date and is not part of
// the create/edit payload - it's read-only here for the same reason it's
// derived there: the row keeps the batch it registered into, and nobody can
// put it out of step with the date by editing it.
const columns = [
  { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { key: 'email', header: 'Email', render: (row) => orDash(row.email) },
  { key: 'phone', header: 'Phone Number', numeric: true, render: (row) => row.phone },
  {
    key: 'batch',
    header: 'Batch',
    align: 'center',
    render: (row) => <Badge tone="blue">{row.batch}</Badge>,
  },
  { key: 'registration_date', header: 'Registration Date', render: (row) => formatDate(row.registration_date) },
  { key: 'paid_date', header: 'Paid Date', render: (row) => (row.paid_date ? formatDate(row.paid_date) : dash) },
  { key: 'sales_person', header: 'Sales Person', render: (row) => orDash(row.sales_person) },
  { key: 'lead_source', header: 'Lead Source', render: (row) => orDash(row.lead_source) },
  { key: 'payment_mode', header: 'Payment Mode', render: (row) => orDash(row.payment_mode) },
  { key: 'category', header: 'Category', render: (row) => orDash(row.category) },
  {
    // Assigned automatically, round-robin across Section Admins, when the
    // entry is created. Shown so whoever keyed it in can see where it landed;
    // it isn't editable here for the same reason it isn't on the form.
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

// Sales Person / Lead Source / Payment Mode / Category are comboboxes, not
// selects: the browser offers the list but the field stays free text, so a
// name or channel that isn't listed can still be typed in.
const fields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone Number', required: true },
  { name: 'registration_date', label: 'Registration Date', type: 'date', required: true },
  { name: 'paid_date', label: 'Paid Date', type: 'date' },
  { name: 'sales_person', label: 'Sales Person', type: 'combobox', options: SALES_PERSON_OPTIONS },
  { name: 'lead_source', label: 'Lead Source', type: 'combobox', options: LEAD_SOURCE_OPTIONS },
  { name: 'payment_mode', label: 'Payment Mode', type: 'combobox', options: PAYMENT_MODE_OPTIONS },
  { name: 'category', label: 'Category', type: 'combobox', options: CATEGORY_OPTIONS },
]

export function InductionCallForm() {
  return (
    <ResourceListPage
      title="Induction Entry"
      queryKey="induction-entries"
      service={inductionEntryService}
      columns={columns}
      serialNumber
      createFields={fields}
      createPermission={PERMISSIONS.LEADS_CREATE}
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
          fields,
          // Dates come back as ISO strings; <input type="date"> needs
          // YYYY-MM-DD, which is the leading 10 characters either way.
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
