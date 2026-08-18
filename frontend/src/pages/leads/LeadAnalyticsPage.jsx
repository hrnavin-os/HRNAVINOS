import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Crown, Megaphone, PhoneCall, Tag, UserRound, UserX, Users, X } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { DataTable } from '@/components/ui/DataTable'
import { DateFilter } from '@/components/ui/DateFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { TabStrip } from '@/components/ui/TabStrip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { BarList } from '@/components/analytics/BarList'
import { DonutChart } from '@/components/analytics/DonutChart'
import { Panel } from '@/components/analytics/Panel'
import { StatTile } from '@/components/analytics/StatTile'
import { percent } from '@/constants/analyticsPalette'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'

// One entry per groupable field on the induction call form. Every string the
// page changes per dimension lives here rather than in a ternary at each use:
// with two tabs `isRemarks ? a : b` was readable, with four it would be a
// four-way conditional repeated in five places, and adding a fifth dimension
// would mean finding all of them.
//
// `key` must match a key in the backend's _ANALYTICS_FIELDS - that map is what
// decides which fields are groupable at all, and this is only the menu of them.
const TABS = [
  {
    key: 'category',
    label: 'Category',
    icon: Tag,
    column: 'Category',
    title: 'Candidates by category',
    subtitle: 'Collected on the induction call form.',
    empty: 'No categories recorded yet.',
    leader: 'Largest category',
  },
  {
    key: 'call_remark',
    label: 'Induction Call Remarks',
    icon: PhoneCall,
    column: 'Call Remark',
    title: 'How induction calls landed',
    subtitle: 'The nineteen remarks grouped into the six outcomes they belong to.',
    empty: 'No call remarks recorded yet. Set one from the dropdown on the induction board.',
    leader: 'Most common remark',
  },
  {
    key: 'sales_person',
    label: 'Sales Person',
    icon: UserRound,
    column: 'Sales Person',
    title: 'Candidates by sales person',
    subtitle: 'Who the form credits, and how many of theirs went on to Foundation.',
    empty: 'No sales person recorded on any induction entry yet.',
    leader: 'Most entries',
  },
  {
    key: 'lead_source',
    label: 'Lead Source',
    icon: Megaphone,
    column: 'Lead Source',
    title: 'Candidates by lead source',
    subtitle: 'Which channel the induction lead arrived through.',
    empty: 'No lead source recorded on any induction entry yet.',
    leader: 'Largest source',
  },
]

const TAB_BY_KEY = Object.fromEntries(TABS.map((item) => [item.key, item]))

// Rolls the individual remarks up into the six groups the board already
// colours by. Nineteen slices is a list, not a chart - the useful shape is how
// the calls landed across six kinds of outcome, and the individual wordings
// keep their detail in the bars and the table beside the ring.
function groupRemarks(items) {
  const totals = REMARK_GROUPS.map((group) => ({ value: group.label, color: group.color, count: 0 }))
  const byLabel = Object.fromEntries(totals.map((row) => [row.value, row]))
  let ungrouped = 0

  for (const item of items) {
    const group = REMARK_GROUP_BY_VALUE[item.value]
    if (group) byLabel[group.label].count += item.count
    else ungrouped += item.count
  }

  // All six outcomes, including the ones nothing landed in. An outcome with
  // nobody in it is a finding - "no candidate quit" is worth reading - and
  // dropping it made the row look like a kind of outcome that doesn't exist.
  const rows = [...totals]
  // "Not set" and anything typed before the dropdown existed. Named rather
  // than dropped: how much of the data is missing is itself a finding.
  if (ungrouped) rows.push({ value: 'No remark yet', color: '#94a3b8', count: ungrouped })
  return rows.sort((a, b) => b.count - a.count)
}

// Every value the form offers, whether anyone has been filed under it or not.
//
// The aggregation can only return values that exist in the data, so an option
// nobody chose is simply absent - and absent reads as "doesn't exist" rather
// than "nobody yet", which are very different findings. A sales person with no
// entries is exactly the thing this board should be able to say out loud.
function withConfiguredValues(items, options) {
  if (!options.length) return items
  const byValue = new Map(items.map((item) => [item.value, item]))
  const configured = options.map(
    (option) => byValue.get(option) ?? { value: option, count: 0, moved: 0, quit: 0 },
  )
  // Values the data carries that the dropdown no longer offers: "Not set", and
  // anything recorded before an option was renamed or removed. Dropping them
  // would leave the ring's total disagreeing with the board's count.
  const unlisted = items.filter((item) => !options.includes(item.value))
  return [...configured, ...unlisted]
}

export function LeadAnalyticsPage() {
  const { user } = useAuth()
  // A Section Admin is pinned to their own section by their role, exactly as
  // on the board - so the filter isn't offered to them rather than offered
  // and then ignored.
  const scopedSection = user?.scoped_section || null

  const [tab, setTab] = useState('category')
  const [dateRange, setDateRange] = useState(null)
  const [section, setSection] = useState('')
  // The highlighted value, shared by all three views on the canvas. One string
  // rather than a per-panel selection: the whole point of a dashboard is that
  // the panels are looking at the same thing.
  const [selected, setSelected] = useState(null)

  function openTab(key) {
    setTab(key)
    // A value picked on one dimension means nothing on the next - "Meta-2" is
    // not a category - so the highlight clears with the tab.
    setSelected(null)
  }

  const filters = {
    date_from: dateRange?.from || undefined,
    date_to: dateRange?.to || undefined,
    section: section || undefined,
  }

  const query = useQuery({
    queryKey: ['induction-analytics', tab, filters],
    queryFn: () => inductionEntryService.getAnalytics(tab, filters),
    // Holds the previous breakdown while the next loads, so switching tabs or
    // moving a filter doesn't collapse the page to a spinner and back.
    placeholderData: (previous) => previous,
  })

  // The admin-editable option lists behind the form's dropdowns, keyed by
  // field - Category, Sales Person and Lead Source all have one. Read from the
  // config rather than hardcoded, so adding a category or a salesperson in
  // Admin > Form Collection puts them on this board at zero without a deploy.
  const configQuery = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: inductionFormConfigService.get,
  })
  const optionsByField = Object.fromEntries(
    (configQuery.data?.fields ?? []).map((field) => [field.key, field.options ?? []]),
  )

  // Sections are admin-managed and open-ended, so the filter reads them live
  // rather than from a fixed list - the same source the boards use.
  const sectionQuery = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })
  const sections = sectionQuery.data?.sections ?? []

  const data = query.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const moved = items.reduce((sum, item) => sum + item.moved, 0)
  const quit = items.reduce((sum, item) => sum + item.quit, 0)
  // The API returns rows sorted by count descending, so the head is the
  // biggest group. Read rather than re-sorted, so the tile and the table can't
  // disagree.
  const largest = items[0] ?? null

  const active = TAB_BY_KEY[tab]
  const isRemarks = tab === 'call_remark'
  const rows = isRemarks ? items : withConfiguredValues(items, optionsByField[tab] ?? [])
  const chartRows = isRemarks ? groupRemarks(items) : rows

  // The ring on the remarks tab shows outcomes, the bars and the table show
  // the wordings inside them - so a highlight has to travel between the two
  // levels. One string does it in both directions: a picked outcome lights
  // every remark in it, and a picked remark lights its outcome.
  const groupOf = (value) => (isRemarks ? REMARK_GROUP_BY_VALUE[value]?.label : undefined)
  const isRowSelected = (row) => !selected || row.value === selected || groupOf(row.value) === selected
  const donutSelection = selected ? groupOf(selected) ?? selected : null
  const pick = (value) => setSelected((current) => (current === value ? null : value))

  // With something picked, the tiles answer for it rather than for everyone -
  // which is the question that was just asked by clicking on it.
  const focus = selected ? rows.filter((row) => isRowSelected(row)) : rows
  const focusCount = focus.reduce((sum, row) => sum + row.count, 0)
  const focusMoved = focus.reduce((sum, row) => sum + row.moved, 0)
  const focusQuit = focus.reduce((sum, row) => sum + row.quit, 0)

  const columns = [
    {
      key: 'value',
      header: active.column,
      render: (row) => (
        <span
          className={`font-medium ${
            selected && !isRowSelected(row) ? 'text-slate-400' : 'text-slate-900'
          }`}
        >
          {row.value === selected && <span className="mr-1.5 text-brand-500">●</span>}
          {row.value}
        </span>
      ),
    },
    { key: 'count', header: 'Candidates', align: 'center', numeric: true },
    { key: 'moved', header: 'Moved to Foundation', align: 'center', numeric: true },
    {
      key: 'conversion',
      header: 'Converted',
      align: 'center',
      render: (row) => (
        <span className={row.moved ? 'font-semibold text-emerald-600' : 'text-slate-400'}>
          {percent(row.moved, row.count)}
        </span>
      ),
    },
    { key: 'quit', header: 'Quit', align: 'center', numeric: true },
    {
      key: 'quit_rate',
      header: 'Quit rate',
      align: 'center',
      render: (row) => (
        <span className={row.quit ? 'font-semibold text-red-600' : 'text-slate-400'}>
          {percent(row.quit, row.count)}
        </span>
      ),
    },
  ]

  return (
    <div>
      {/* Title and tabs on one line. The Topbar already says "Dashboard"; this
          says which dashboard, which the header cannot because it reads the
          nav label. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
          <p className="mt-0.5 text-sm text-amber-600">
            Induction call insights &amp; candidate categorization
          </p>
        </div>
        <TabStrip equal tabs={TABS} value={tab} onChange={openTab} className="min-w-0 flex-1 basis-lg" />
      </div>

      {/* The filter rail. One window and one section for every view on the
          canvas, so two panels on the same screen can never end up describing
          different populations - the failure that makes a dashboard
          untrustworthy rather than merely wrong. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filters</span>
        <div className="w-56">
          <DateFilter grow label="Registration date" value={dateRange} onChange={setDateRange} />
        </div>
        {!scopedSection && (
          <div className="w-44">
            <FilterDropdown
              grow
              label="Section"
              value={section}
              options={sections.map((item) => ({ value: item.code, label: item.label }))}
              onChange={setSection}
            />
          </div>
        )}
        {selected && (
          // The highlight is a filter you set by clicking a chart, so it says
          // so in the same row as the ones you set from a menu - and can be
          // dropped from here without hunting for the mark you clicked.
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-2.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            {selected}
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {selected ? `${focusCount} of ${total} highlighted` : `${total} candidates in scope`}
        </span>
      </div>

      <ErrorMessage message={query.error ? getApiErrorMessage(query.error) : null} />

      {query.isLoading && !data ? (
        <LoadingSpinner />
      ) : (
        // Dimmed rather than replaced while refetching, so the page doesn't
        // jump between a skeleton and content on every tab switch.
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={selected ? 'Highlighted' : 'Candidates'}
              value={focusCount}
              share={selected ? percent(focusCount, total) : null}
              icon={Users}
              hint={selected ? `of ${total} in scope` : 'In the current filters'}
            />
            <StatTile
              label="Moved to Foundation"
              value={focusMoved}
              share={percent(focusMoved, focusCount)}
              icon={ArrowRightLeft}
              tone="emerald"
            />
            <StatTile
              label="Quit"
              value={focusQuit}
              share={percent(focusQuit, focusCount)}
              icon={UserX}
              tone="red"
            />
            <StatTile
              label={active.leader}
              value={largest ? largest.value : '—'}
              share={largest ? percent(largest.count, total) : null}
              icon={Crown}
            />
          </div>

          {/* Two coordinated views side by side: the ring for the split, the
              bars for the ranking. Both read the same rows, and clicking a
              mark in either highlights it in the other and in the table
              underneath. */}
          {/* minmax(0, ...) rather than plain fractions: a grid track sized
              from its content lets the ring and its legend push the card wider
              than the column, which is what spilled the panel's own header off
              the right of the page. */}
          <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
            <Panel
              className="min-w-0"
              title={active.title}
              subtitle={`${active.subtitle} Click a slice to highlight it in every view.`}
            >
              <DonutChart
                items={chartRows}
                centerLabel="Candidates"
                emptyMessage={active.empty}
                selected={donutSelection}
                onSelect={pick}
              />
            </Panel>
            <Panel
              className="min-w-0"
              title="Ranked by volume"
              subtitle={`Largest ${active.column.toLowerCase()} first. Click a bar to highlight it.`}
            >
              {rows.length ? (
                <BarList items={rows} limit={10} isSelected={isRowSelected} onSelect={pick} />
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">{active.empty}</p>
              )}
            </Panel>
          </div>

          {/* The table view: the same numbers without relying on colour or bar
              length, plus the conversion and quit rates the marks don't carry. */}
          <Panel
            title={`Conversion by ${active.column.toLowerCase()}`}
            subtitle="Every value, including the ones nobody has been filed under."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyMessage={active.empty}
              onRowClick={(row) => pick(row.value)}
            />
          </Panel>
        </div>
      )}
    </div>
  )
}
