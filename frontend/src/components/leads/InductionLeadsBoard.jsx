import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { ArrowRightLeft, ClipboardList, Target, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DatePresetFilter } from '@/components/ui/DatePresetFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { SortOrderSelect } from '@/components/ui/SortOrderSelect'
import { Toast } from '@/components/ui/Toast'
import { StatCard } from '@/components/ui/StatCard'
import { InductionCallRemarkCell } from '@/components/leads/InductionCallRemarkCell'
import { InductionScheduleCell } from '@/components/leads/InductionScheduleCell'
import { InductionCategoryCell } from '@/components/leads/InductionCategoryCell'
import { InductionGroupCell } from '@/components/leads/FoundationGroupCell'
import { InductionQuitReasonCell } from '@/components/leads/InductionQuitReasonCell'
import { InductionEntryDetail } from '@/components/leads/InductionEntryDetail'
import { InductionUpdateModal } from '@/components/leads/InductionUpdateModal'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { FOUNDATION_GROUP_LABELS, FOUNDATION_GROUP_OPTIONS } from '@/constants/foundationGroups'
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
    // The number typed on the Induction form, shown as "Batch-20".
    key: 'batch',
    header: 'Batch',
    align: 'center',
    render: (row) => (row.batch ? <Badge tone="blue">{row.batch}</Badge> : dash),
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
    render: (row) => (row.batch ? <Badge tone="blue">{row.batch}</Badge> : dash),
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
  // The number alone; the board shows it as "Batch-20".
  { name: 'batch_number', label: 'Batch Number', type: 'number' },
  { name: 'sales_person', label: 'Sales Person' },
  { name: 'lead_source', label: 'Lead Source' },
  { name: 'payment_mode', label: 'Payment Mode' },
  { name: 'category', label: 'Category' },
]


const EMPTY_FILTERS = {
  batch: '',
  foundation_group: '',
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
  // What was typed in the search box. ResourceListPage owns the box and runs
  // the list query from it; this copy exists only so the stat cards can count
  // the same rows - they are a summary of the table, and a summary that
  // ignored the search would be counting rows that aren't on screen.
  const [search, setSearch] = useState('')

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  // A Section Admin is pinned to their own section, exactly as on the
  // Foundation board - the role carries it, so it can't be changed by clicking.
  // The server forces it on regardless; sending it keeps the query key honest.
  const effectiveSection = scopedSection || sectionFilter

  // Everything narrowing the board, as the API takes it. One object because
  // the table and the cards above it have to be asking the same question -
  // the cards are a summary of the rows, and they were reading the whole
  // board, so a Section Admin with two students saw a card saying thirty.
  //
  // Empty strings would be sent as `?batch=` and match nothing, so only the
  // set ones reach the query. The date range adds its own two, either of which
  // may be missing - an open-ended "since March" is a real question.
  const activeFilters = {
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    ...(effectiveSection ? { section: effectiveSection } : {}),
    ...(dateRange?.from ? { date_from: dateRange.from } : {}),
    ...(dateRange?.to ? { date_to: dateRange.to } : {}),
    ...(search ? { search } : {}),
  }

  // Keyed under the list's own key so ResourceListPage's invalidation after an
  // edit or delete refreshes the cards too - React Query matches by prefix.
  // The filters are part of the key, or the cards would keep showing the last
  // filter's counts until the refetch landed - which is the same wrong number
  // this was meant to stop showing, just briefly.
  //
  // The status is NOT sent as a filter: the response counts all three tabs
  // under these filters, which is what the three cards read.
  const statsQuery = useQuery({
    queryKey: ['induction-entries', 'stats', activeFilters],
    queryFn: () => inductionEntryService.getStats(undefined, activeFilters),
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

  // The induction form's own dropdown lists, for the Category cell. Read from
  // the config rather than hardcoded, so a category added in Admin > Form
  // Collection is offered on the board without a deploy.
  const inductionConfigQuery = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: inductionFormConfigService.get,
  })

  const sections = configQuery.data?.sections ?? []

  // Plain string lists come back for everything except Assigned To, which
  // needs an id to filter on and a name to show.
  const asOptions = (values) => (values ?? []).map((value) => ({ value, label: value }))
  const options = optionsQuery.data ?? {}

  // What the Category cell offers. The configured list leads, so an option
  // nobody has been filed under yet is still there to pick; anything already
  // in the data that the list no longer offers follows it, or an entry
  // recorded before a rename would show a value its own dropdown denies.
  const configuredCategories =
    (inductionConfigQuery.data?.fields ?? []).find((field) => field.key === 'category')?.options ?? []
  const categoryOptions = [
    ...configuredCategories,
    ...(options.category ?? []).filter((value) => !configuredCategories.includes(value)),
  ]

  // What the Group cell offers, read from the same config for the same reason:
  // a fourth class added in Admin > Form Collection has to be pickable on the
  // board too, or students could be enrolled into a group nobody can move
  // anyone else into. Falls back to the three defaults while the config is
  // still loading, so the cell is never an empty menu.
  const groupOptions =
    (inductionConfigQuery.data?.fields ?? []).find((field) => field.key === 'group')?.options?.length
      ? inductionConfigQuery.data.fields.find((field) => field.key === 'group').options
      : FOUNDATION_GROUP_LABELS

  const byStatus = statsQuery.data?.by_status ?? {}

  // Built here rather than at module scope because the cells need somewhere to
  // report a failed save - an inline edit has no form to hang an error on, and
  // silently reverting would leave somebody believing it saved. The category
  // cell also needs the configured options, which arrive from a query.
  const remarkColumn = {
    key: 'call_remark',
    header: 'Induction Call Remarks',
    render: (row) => <InductionCallRemarkCell entry={row} onError={setError} />,
  }
  const categoryColumn = {
    key: 'category',
    header: 'Category',
    render: (row) => <InductionCategoryCell entry={row} options={categoryOptions} onError={setError} />,
  }
  // Beside the batch, because the two are read together - "Group 2 of
  // Batch-28".
  const groupColumn = {
    key: 'foundation_group',
    header: 'Group',
    align: 'center',
    render: (row) => <InductionGroupCell entry={row} options={groupOptions} onError={setError} />,
  }
  // One column for the date and the time, because they are one fact - a date
  // with no time is half an appointment. Both used to live on the fourth page
  // of the Update modal, which meant opening a four-step form to read the one
  // thing you need when deciding who to call next.
  const scheduleColumn = {
    key: 'induction_schedule',
    header: 'Induction Call Schedule',
    render: (row) => <InductionScheduleCell entry={row} onError={setError} />,
  }
  // Only on the Quit tab, and only there: a reason exists precisely when the
  // remark beside it says quit, which is what puts a row on that tab in the
  // first place, so anywhere else this is a column of blanks.
  const quitReasonColumn = {
    key: 'quit_reason',
    header: 'Quit Reason',
    render: (row) => <InductionQuitReasonCell entry={row} onError={setError} />,
  }

  // Group sits with the batch it is read beside; category, then schedule, then
  // remark follow in the order they get filled in: what kind of candidate this
  // is, when the call is, then how it went.
  const pendingColumns = insertBefore(
    insertBefore(
      insertBefore(
        insertBefore(
          // A Section Admin only ever sees their own section's entries, so
          // every row would name them - a column of one repeated value.
          scopedSection ? columns.filter((column) => column.key !== 'assigned_to') : columns,
          'registration_date',
          groupColumn,
        ),
        'assigned_to',
        categoryColumn,
      ),
      'assigned_to',
      scheduleColumn,
    ),
    'assigned_to',
    remarkColumn,
  )
  // The Moved tab gets it too, and editable there as well: a student who has
  // crossed to Foundation is still sitting in a class, and the attendance roll
  // reads the group off this record whichever board it was set from.
  const movedColumns = insertBefore(
    insertBefore(
      insertBefore(MOVED_COLUMNS, 'foundation_status', scheduleColumn),
      'foundation_status',
      remarkColumn,
    ),
    'foundation_status',
    groupColumn,
  )

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
            // The filters stay on. They used to be cleared here, back when the
            // cards counted the whole board and the number on them had nothing
            // to do with the filter row. Now the card says how many rows match
            // what you have asked for - so clearing on the way in would hand
            // you a different set from the one you just clicked on.
            onClick={() => setStatus(view.value)}
          />
        ))}
      </div>
      <ResourceListPage
        // Two rows: the first is how you find and order the list (search, date,
        // sort, section); the second is the per-field dropdowns.
        onSearchChange={setSearch}
        renderToolbar={({ searchInput }) => (
          <div className="space-y-2">
            {/* Every control grows, so the row spans the full width the way the
                grid below it does; they wrap rather than squeeze when narrow. */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-56 flex-[1.5]">{searchInput}</div>
              {/* Filters the registration date. Sized to its segments and never
                  shrunk, so a label can't spill into the control beside it. */}
              <div className="shrink-0">
                <DatePresetFilter value={dateRange} onChange={setDateRange} />
              </div>
              {/* Orders by registration date. The same control the Foundation
                  board uses, so the two boards can't word their ordering
                  differently. */}
              <div className="min-w-36 flex-1">
                <SortOrderSelect grow value={sortOrder} onChange={setSortOrder} />
              </div>
              {/* A Section Admin is pinned to their own section by their role,
                  so offering them a chooser would be a control that can only
                  pick what they already have. Assignee is hidden for the same
                  reason. */}
              {!scopedSection && (
                <div className="min-w-36 flex-1">
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
                </div>
              )}
              {!scopedSection && (
                <div className="min-w-36 flex-1">
                  <FilterDropdown
                    grow
                    label="Assignee"
                    value={filters.assigned_to}
                    options={options.assigned_to ?? []}
                    onChange={(value) => setFilter('assigned_to', value)}
                  />
                </div>
              )}
              {/* No "Clear all" button. It appeared as a second row the
                  moment anything was selected, pushing the table down, and
                  every control it would have reset already clears itself -
                  each dropdown shows an X once it holds a value, and the date
                  filter's own "All" is the whole-range option. */}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <FilterDropdown
                grow
                label="Batch"
                value={filters.batch}
                options={asOptions(options.batch)}
                onChange={(value) => setFilter('batch', value)}
              />
              {/* A fixed list rather than the values in the data: "nobody is
                  in Group 3" is an answer this filter should be able to give
                  rather than an option it quietly drops. */}
              <FilterDropdown
                grow
                label="Group"
                value={filters.foundation_group}
                options={FOUNDATION_GROUP_OPTIONS}
                onChange={(value) => setFilter('foundation_group', value)}
              />
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
            </div>
          </div>
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
              ? insertBefore(pendingColumns, 'assigned_to', quitReasonColumn)
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
                    batch_number: row.batch_number ?? '',
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
