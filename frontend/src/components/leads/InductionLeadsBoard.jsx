import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { ArrowDownUp, ArrowRightLeft, ClipboardList, Target, UserX, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DateFilter } from '@/components/ui/DateFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { Toast } from '@/components/ui/Toast'
import { StatCard } from '@/components/ui/StatCard'
import { InductionCallRemarkCell } from '@/components/leads/InductionCallRemarkCell'
import { InductionEntryDetail } from '@/components/leads/InductionEntryDetail'
import { InductionUpdateModal } from '@/components/leads/InductionUpdateModal'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { formatDate, formatDateTime } from '@/utils/formatters'

const dash = <span className="text-slate-400">—</span>
const orDash = (value) => value || dash

// Mirrors InductionStatus on the backend, which derives these from the call
// remark and whether the entry carries a foundation_lead_id.
const INDUCTION_STATUS = {
  pending: 'pending_induction',
  moved: 'moved_to_foundation',
  quit: 'quit',
}

// The three cards double as the view selector, the way the Foundation board's
// section cards do. They partition the board - quit takes precedence over the
// other two - so the counts sum to everything it holds.
const VIEWS = [
  { value: INDUCTION_STATUS.pending, label: 'Induction Leads', tone: 'brand', icon: Target },
  { value: INDUCTION_STATUS.moved, label: 'Moved to Foundation', tone: 'emerald', icon: ArrowRightLeft },
  { value: INDUCTION_STATUS.quit, label: 'Quit Students', tone: 'red', icon: UserX },
]

// Induction submissions are their own records, not Leads, so this board has
// its own columns rather than reusing the Foundation ones - there is no stage,
// payment plan or query on an induction entry.
//
// No create form: entries arrive through the shareable form in
// Admin > Form Collection. Editing stays available for corrections.
const columns = [
  { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  {
    // Phone over email is a deliberate two-line stack, not wrapping - each
    // line is still a single unbroken value.
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
  {
    key: 'lead_source',
    header: 'Lead Source',
    render: (row) => (row.lead_source ? <Badge tone="amber">{row.lead_source}</Badge> : dash),
  },
  {
    key: 'payment_mode',
    header: 'Payment Mode',
    render: (row) => (row.payment_mode ? <span className="text-slate-700">{row.payment_mode}</span> : dash),
  },
  {
    key: 'category',
    header: 'Category',
    render: (row) => (row.category ? <Badge tone="emerald">{row.category}</Badge> : dash),
  },
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

// What the Moved tab shows. A different set from the working columns on
// purpose: once an entry has crossed over, sales person and payment mode are
// induction bookkeeping, and what you actually want to know is who moved, when
// they registered, when they crossed, and where they are now.
const MOVED_COLUMNS = [
  { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { key: 'phone', header: 'Mobile Number' },
  {
    key: 'registration_date',
    header: 'Induction Date',
    align: 'center',
    render: (row) => formatDate(row.registration_date),
  },
  {
    key: 'converted_at',
    header: 'Moved On',
    align: 'center',
    render: (row) => (row.converted_at ? formatDateTime(row.converted_at) : dash),
  },
  {
    key: 'batch',
    header: 'Batch',
    align: 'center',
    render: (row) => <Badge tone="blue">{row.batch}</Badge>,
  },
  {
    // The linked lead's pipeline stage, resolved server-side for the page.
    // Falls back to a plain dash rather than an empty cell if the lead has
    // since been deleted - the entry survives it, so the row must too.
    key: 'foundation_status',
    header: 'Foundation Status',
    align: 'center',
    render: (row) => {
      const stage = LEAD_STAGE_BY_VALUE[row.foundation_status]
      if (!stage) return dash
      return <Badge tone={stage.tone}>{stage.label}</Badge>
    },
  },
]

// Inserts a column immediately before a named one, appending if that column
// isn't present - a Section Admin's table drops Assigned To, and the remark
// still has to land somewhere rather than vanish with its anchor.
function insertBefore(columnList, key, column) {
  const index = columnList.findIndex((item) => item.key === key)
  if (index === -1) return [...columnList, column]
  return [...columnList.slice(0, index), column, ...columnList.slice(index)]
}

// A row's post-call details are "started" once any one of the four pages has
// an answer - used to label the Update button so you can see at a glance which
// entries still need working.
function hasDetails(entry) {
  return [entry.qualification, entry.placement, entry.remarks, entry.other_details].some((group) =>
    Object.values(group ?? {}).some((value) => value !== null && value !== undefined && value !== ''),
  )
}

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
  // A registration-date window: { from, to, preset } or null. Kept out of
  // `filters` because it is one filter that sends two params, and folding it
  // in would make the "Clear (n)" count read one date range as two.
  const [dateRange, setDateRange] = useState(null)
  // Newest or oldest registration first. Not a filter - it hides nothing - so
  // it sits outside `filters` and survives clearing them.
  const [sortOrder, setSortOrder] = useState('desc')

  // Which tab. Backed by a real status on the server (InductionStatus, derived
  // from foundation_lead_id) rather than a client-side filter, so an entry is
  // in exactly one tab and the counts come from the same source as the rows.
  const [status, setStatus] = useState(INDUCTION_STATUS.pending)
  const moved = status === INDUCTION_STATUS.moved
  const quit = status === INDUCTION_STATUS.quit
  // Inline cell edits have no form to attach a failure to, so they surface
  // here rather than reverting as if nothing happened.
  const [error, setError] = useState(null)

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  // Empty strings would be sent as `?batch=` and match nothing, so only the
  // set ones reach the query. The date range adds its own two, either of which
  // may be missing - an open-ended "since March" is a real question.
  const activeFilters = {
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    ...(dateRange?.from ? { date_from: dateRange.from } : {}),
    ...(dateRange?.to ? { date_to: dateRange.to } : {}),
  }
  // Counted as one, however many params it sends.
  const filterCount = Object.values(filters).filter(Boolean).length + (dateRange ? 1 : 0)

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setDateRange(null)
  }

  // A Section Admin is pinned to their own section, exactly as on the
  // Foundation board - the role carries it, so it can't be changed by clicking.
  const effectiveSection = scopedSection || sectionFilter

  // Keyed under the list's own key so ResourceListPage's invalidation after an
  // edit or delete refreshes the cards too - React Query matches by prefix.
  // The status is part of the key, or switching tabs would show the previous
  // tab's counts until the refetch landed.
  const statsQuery = useQuery({
    queryKey: ['induction-entries', 'stats', status],
    queryFn: () => inductionEntryService.getStats(status),
  })

  // Sections are admin-managed and open-ended, so the cards read live from the
  // form config rather than a fixed list - same source the Foundation cards use.
  const configQuery = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  const [updatingEntry, setUpdatingEntry] = useState(null)

  const optionsQuery = useQuery({
    queryKey: ['induction-entries', 'filter-options', status],
    queryFn: () => inductionEntryService.getFilterOptions(status),
  })

  const sections = configQuery.data?.sections ?? []

  // Plain string lists come back for everything except Assigned To, which
  // needs an id to filter on and a name to show.
  const asOptions = (values) => (values ?? []).map((value) => ({ value, label: value }))
  const options = optionsQuery.data ?? {}

  const byStatus = statsQuery.data?.by_status ?? {}

  // Built here rather than at module scope because the cell needs somewhere to
  // report a failed save - an inline edit has no form to hang an error on, and
  // silently reverting would leave somebody believing it saved.
  const remarkColumn = {
    key: 'call_remark',
    header: 'Induction Call Remarks',
    render: (row) => <InductionCallRemarkCell entry={row} onError={setError} />,
  }

  const pendingColumns = insertBefore(
    // A Section Admin only ever sees their own section's entries, so every row
    // would name them - a column of one repeated value.
    scopedSection ? columns.filter((column) => column.key !== 'assigned_to') : columns,
    'assigned_to',
    remarkColumn,
  )
  const movedColumns = insertBefore(MOVED_COLUMNS, 'foundation_status', remarkColumn)

  return (
    <>
      {/* The cards are the view selector, replacing both the tab strip and the
          per-section cards that used to sit here. Section is still filterable -
          it moved into the filter row, where it sits beside the other six
          rather than spending the whole top of the page on one dimension. */}
      <div className="mb-4 flex flex-wrap gap-3">
        {VIEWS.map((view) => (
          <StatCard
            key={view.value}
            label={view.label}
            value={byStatus[view.value] ?? 0}
            toneName={view.tone}
            icon={view.icon}
            isActive={status === view.value}
            onClick={() => {
              setStatus(view.value)
              clearFilters()
            }}
          />
        ))}
      </div>
      <ResourceListPage
        // Rendered inline beside the search box rather than as a band above
        // it - same job, and two stacked rows pushed the table off screen.
        renderFilters={() => (
          <>
            {/* Section moved down here from the cards above. A Section Admin
                is pinned to their own by their role, so offering them a
                chooser would be a control that can only pick what they already
                have. */}
            {!scopedSection && (
              <FilterDropdown
                grow
                label="Section"
                value={sectionFilter}
                options={sections.map((section) => ({
                  value: section.code,
                  label: section.label,
                }))}
                onChange={setSectionFilter}
              />
            )}
            <FilterDropdown
              grow
              label="Batch"
              value={filters.batch}
              options={asOptions(options.batch)}
              onChange={(value) => setFilter('batch', value)}
            />
            {/* Sits beside Batch because they narrow the same field: Batch is
                a whole month of registrations, this is any window inside or
                across them. */}
            <DateFilter grow value={dateRange} onChange={setDateRange} />
            <FilterDropdown
              grow
              label="Sales Person"
              value={filters.sales_person}
              options={asOptions(options.sales_person)}
              onChange={(value) => setFilter('sales_person', value)}
            />
            <FilterDropdown
              grow
              label="Lead Source"
              value={filters.lead_source}
              options={asOptions(options.lead_source)}
              onChange={(value) => setFilter('lead_source', value)}
            />
            <FilterDropdown
              grow
              label="Payment Mode"
              value={filters.payment_mode}
              options={asOptions(options.payment_mode)}
              onChange={(value) => setFilter('payment_mode', value)}
            />
            <FilterDropdown
              grow
              label="Category"
              value={filters.category}
              options={asOptions(options.category)}
              onChange={(value) => setFilter('category', value)}
            />
            <FilterDropdown
              grow
              label="Assignee"
              value={filters.assigned_to}
              options={options.assigned_to ?? []}
              onChange={(value) => setFilter('assigned_to', value)}
            />
            {/* Newest or oldest first, and it always says which. A dropdown
                would have needed a third, "unset" state that means the same
                as one of the two - so it's a toggle that shows the order it
                is in, not the order it would switch to. */}
            <button
              type="button"
              onClick={() => setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
              title="Order by registration date"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <ArrowDownUp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
              {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
            </button>
            {filterCount > 0 && (
              // Deliberately not a Button: it must not take a filter-sized
              // slot in the row, and it counts what it will undo so you can
              // see at a glance how narrowed the list is.
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Clear ({filterCount})
              </button>
            )}
          </>
        )}
        title="Induction Entry"
        queryKey="induction-entries"
        service={inductionEntryService}
        // The post-call Update form belongs to an entry still being worked.
        // Moved entries have crossed to Foundation, where the lead's own popup
        // takes over, and a candidate who has quit is not going to be called
        // through the four pages either - both are records of what happened.
        columns={
          moved
            ? movedColumns
            : quit
              ? pendingColumns
              : [
                ...pendingColumns,
                {
                  // Last column, before Actions: opens the four-page post-call form.
                  key: 'update',
                  header: 'Update',
                  align: 'center',
                  render: (row) => (
                    <Button
                      variant="secondary"
                      className="px-3! py-1! text-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        setUpdatingEntry(row)
                      }}
                    >
                      <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      {hasDetails(row) ? 'Edit' : 'Update'}
                    </Button>
                  ),
                },
              ]
        }
        serialNumber
        extraParams={{ status, sort_order: sortOrder, section: effectiveSection || undefined, ...activeFilters }}
        // View stays on both tabs - the induction record is exactly what you
        // want to read about somebody who has moved. Edit and delete don't:
        // a moved entry is the history behind a Foundation lead, and editing
        // the phone number there would break the match that put it here.
        rowActions={{
          view: {
            title: (row) => row.name,
            maxWidth: 'max-w-xl',
            // Hidden for the same reason as the column: it's always them.
            renderBody: (row) => <InductionEntryDetail entry={row} hideAssignee={Boolean(scopedSection)} />,
          },
          ...(moved
            ? {}
            : {
                edit: {
                  title: (row) => `Edit ${row.name}`,
                  permission: PERMISSIONS.LEADS_UPDATE,
                  fields: editFields,
                  // Dates arrive as ISO strings; <input type="date"> wants
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
              }),
        }}
      />

      {updatingEntry && (
        <InductionUpdateModal entry={updatingEntry} onClose={() => setUpdatingEntry(null)} />
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
    </>
  )
}
