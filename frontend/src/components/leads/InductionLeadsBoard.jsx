import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { useAuth } from '@/hooks/useAuth'
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

const EMPTY_FILTERS = {
  batch: '',
  sales_person: '',
  lead_source: '',
  payment_mode: '',
  category: '',
  assigned_to: '',
}

export function InductionLeadsBoard() {
  const { user } = useAuth()
  const scopedSection = user?.scoped_section || null
  const [sectionFilter, setSectionFilter] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  const hasFilters = Object.values(filters).some(Boolean)
  // Empty strings would be sent as `?batch=` and match nothing, so only the
  // set ones reach the query.
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))

  // A Section Admin is pinned to their own section, exactly as on the
  // Foundation board - the role carries it, so it can't be changed by clicking.
  const effectiveSection = scopedSection || sectionFilter

  // Keyed under the list's own key so ResourceListPage's invalidation after an
  // edit or delete refreshes the cards too - React Query matches by prefix.
  const statsQuery = useQuery({
    queryKey: ['induction-entries', 'stats'],
    queryFn: inductionEntryService.getStats,
  })

  // Sections are admin-managed and open-ended, so the cards read live from the
  // form config rather than a fixed list - same source the Foundation cards use.
  const configQuery = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  const optionsQuery = useQuery({
    queryKey: ['induction-entries', 'filter-options'],
    queryFn: inductionEntryService.getFilterOptions,
  })

  const sections = configQuery.data?.sections ?? []
  const visibleSections = scopedSection ? sections.filter((s) => s.code === scopedSection) : sections

  // Plain string lists come back for everything except Assigned To, which
  // needs an id to filter on and a name to show.
  const asOptions = (values) => (values ?? []).map((value) => ({ value, label: value }))
  const options = optionsQuery.data ?? {}

  return (
    <>
      <LeadSectionStats
        allLabel="All Entries"
        total={statsQuery.data?.total ?? 0}
        sections={visibleSections}
        bySection={statsQuery.data?.by_section ?? {}}
        activeSection={effectiveSection}
        onSelect={scopedSection ? () => {} : setSectionFilter}
      />
      {/* Sits above the table rather than in column headers, matching the
          Foundation board's filter row. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Batch"
          value={filters.batch}
          options={asOptions(options.batch)}
          onChange={(value) => setFilter('batch', value)}
        />
        <FilterDropdown
          label="Sales Person"
          value={filters.sales_person}
          options={asOptions(options.sales_person)}
          onChange={(value) => setFilter('sales_person', value)}
        />
        <FilterDropdown
          label="Lead Source"
          value={filters.lead_source}
          options={asOptions(options.lead_source)}
          onChange={(value) => setFilter('lead_source', value)}
        />
        <FilterDropdown
          label="Payment Mode"
          value={filters.payment_mode}
          options={asOptions(options.payment_mode)}
          onChange={(value) => setFilter('payment_mode', value)}
        />
        <FilterDropdown
          label="Category"
          value={filters.category}
          options={asOptions(options.category)}
          onChange={(value) => setFilter('category', value)}
        />
        <FilterDropdown
          label="Assignee"
          value={filters.assigned_to}
          options={options.assigned_to ?? []}
          onChange={(value) => setFilter('assigned_to', value)}
        />
        {hasFilters && (
          <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      <ResourceListPage
        title="Induction Entry"
        queryKey="induction-entries"
        service={inductionEntryService}
        columns={columns}
        serialNumber
        extraParams={{ section: effectiveSection || undefined, ...activeFilters }}
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
    </>
  )
}
