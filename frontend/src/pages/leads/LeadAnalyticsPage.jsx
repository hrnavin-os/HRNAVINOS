import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Activity,
  Crown,
  Megaphone,
  PhoneCall,
  Tag,
  UserRound,
  UserX,
  Users,
  X,
  XCircle,
} from 'lucide-react'
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
import { DonutChart, foldToSlices } from '@/components/analytics/DonutChart'
import { Panel, SegmentedToggle } from '@/components/analytics/Panel'
import { MiniStatStrip, StatTile } from '@/components/analytics/StatTile'
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
    noun: 'category',
    plural: 'categories',
    title: 'Candidates by Category',
    subtitle: 'Distribution of candidates across the categories the form records.',
    hint: 'Counts every induction entry in the current filters, including those with no category set.',
    empty: 'No categories recorded yet.',
    leader: 'Largest category',
  },
  {
    key: 'call_remark',
    label: 'Induction Call Remarks',
    icon: PhoneCall,
    column: 'Call Remark',
    noun: 'outcome',
    plural: 'remarks',
    title: 'Candidates by Call Outcome',
    subtitle: 'The nineteen remarks grouped into the six outcomes they belong to.',
    hint: 'The ring groups the remarks into outcomes; the ranking beside it keeps the exact wording each caller chose.',
    empty: 'No call remarks recorded yet. Set one from the dropdown on the induction board.',
    leader: 'Most common remark',
  },
  {
    key: 'sales_person',
    label: 'Sales Person',
    icon: UserRound,
    column: 'Sales Person',
    noun: 'sales person',
    plural: 'sales people',
    title: 'Candidates by Sales Person',
    subtitle: 'Who the form credits, and how many of theirs went on to Foundation.',
    hint: 'The sales person is recorded on the induction form, not the round-robin assignee who works the entry.',
    empty: 'No sales person recorded on any induction entry yet.',
    leader: 'Most entries',
  },
  {
    key: 'lead_source',
    label: 'Lead Source',
    icon: Megaphone,
    column: 'Lead Source',
    noun: 'source',
    plural: 'sources',
    title: 'Candidates by Lead Source',
    subtitle: 'Which channel the induction lead arrived through.',
    hint: 'Whatever the form recorded, including sources that are no longer offered on the dropdown.',
    empty: 'No lead source recorded on any induction entry yet.',
    leader: 'Largest source',
  },
]

const TAB_BY_KEY = Object.fromEntries(TABS.map((item) => [item.key, item]))

const MEASURES = [
  { value: 'count', label: 'Count' },
  { value: 'share', label: 'Percentage' },
]

// Rolls the individual remarks up into the six groups the board already
// colours by. Nineteen slices is a list, not a chart - the useful shape is how
// the calls landed across six kinds of outcome, and the individual wordings
// keep their detail in the ranking and the table beside the ring.
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

// Percentage change against the previous period. Undefined when there was
// nothing to compare against: a rise "from zero" is not a percentage, and
// printing one would put an authoritative-looking number on a division that
// never happened.
function change(now, before) {
  if (!before) return undefined
  return Math.round(((now - before) / before) * 100)
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
  const [measure, setMeasure] = useState('count')
  // The highlighted value, shared by every view on the canvas. One string
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

  // What the period arrows compare. Not always the headline figures: with no
  // window set the board totals everything, and there is no period before all
  // time - so the server measures the last thirty days against the thirty
  // before and says so in the label.
  const now = data?.current
  const before = data?.comparison

  const active = TAB_BY_KEY[tab]
  const isRemarks = tab === 'call_remark'
  const rows = isRemarks ? items : withConfiguredValues(items, optionsByField[tab] ?? [])
  const chartRows = isRemarks ? groupRemarks(items) : rows

  // The ring's own colour assignment, read back so the ranking can wear it
  // too. The same entity keeps the same colour in both views, which is what
  // lets a reader carry one across to the other.
  const colors = new Map(foldToSlices(chartRows).map((slice) => [slice.value, slice.color]))

  // The ring on the remarks tab shows outcomes, the ranking and the table show
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
          className={`flex items-center gap-2 font-medium ${
            selected && !isRowSelected(row) ? 'text-slate-400' : 'text-slate-900'
          }`}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: colors.get(row.value) ?? '#cbd5e1' }}
            aria-hidden="true"
          />
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
      {/* The control deck: what this board is, which dimension it is cut by,
          and the window it covers - one card in two bands rather than three
          rows floating on the page. Everything that answers "what am I looking
          at" is then one block at the top, and the panels below start where
          the reading starts.
          (The Topbar already says "Dashboard"; this says which dashboard,
          which the header cannot because it reads the nav label.) */}
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
              <p className="text-[11px] font-medium text-amber-600">
                Induction call insights &amp; candidate categorization
              </p>
            </div>
          </div>
          <TabStrip equal tabs={TABS} value={tab} onChange={openTab} className="min-w-0 flex-1 basis-lg" />
        </div>

        {/* The filter band. One window and one section for every view on the
            canvas, so two panels on the same screen can never end up
            describing different populations - the failure that makes a
            dashboard untrustworthy rather than merely wrong. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Filters</span>
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
            // The highlight is a filter you set by clicking a chart, so it
            // says so in the same row as the ones you set from a menu - and
            // can be dropped from here without hunting for the mark you
            // clicked.
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100"
            >
              {selected}
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            </button>
          )}
          {/* The population every figure below is drawn from, stated once. In
              a pill rather than loose text: it is a reading of the current
              filters, not a caption on them. */}
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            {selected ? `${focusCount} of ${total} highlighted` : `${total} candidates in scope`}
          </span>
        </div>
      </div>

      <ErrorMessage message={query.error ? getApiErrorMessage(query.error) : null} />

      {query.isLoading && !data ? (
        <LoadingSpinner />
      ) : (
        // Dimmed rather than replaced while refetching, so the page doesn't
        // jump between a skeleton and content on every tab switch.
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={selected ? 'Highlighted candidates' : 'Total candidates'}
              value={focusCount}
              share={selected ? percent(focusCount, total) : null}
              delta={selected ? undefined : change(now?.total, before?.total)}
              deltaLabel={selected ? `of ${total} in scope` : before?.label}
              icon={Users}
            />
            <StatTile
              label="Moved to Foundation"
              value={focusMoved}
              share={percent(focusMoved, focusCount)}
              delta={selected ? undefined : change(now?.moved, before?.moved)}
              deltaLabel={selected ? null : before?.label}
              icon={ArrowRightLeft}
              tone="emerald"
            />
            <StatTile
              label="Quit"
              value={focusQuit}
              share={percent(focusQuit, focusCount)}
              delta={selected ? undefined : change(now?.quit, before?.quit)}
              deltaLabel={selected ? null : before?.label}
              // More people quitting is not good news, whichever way the
              // arrow points.
              invert
              icon={UserX}
              tone="red"
            />
            <StatTile
              label={active.leader}
              value={largest ? largest.value : '—'}
              share={largest ? percent(largest.count, total) : null}
              deltaLabel={largest ? `${largest.count} candidates` : null}
              icon={Crown}
            />
          </div>

          {/* One panel wide now that the bar list is gone - the two-column
              grid it shared existed only to sit the two side by side. */}
          <div className="mb-3">
            <Panel
              className="min-w-0"
              title={active.title}
              subtitle={active.subtitle}
              hint={active.hint}
              action={
                <SegmentedToggle
                  label="Show counts or percentages"
                  options={MEASURES}
                  value={measure}
                  onChange={setMeasure}
                />
              }
            >
              <DonutChart
                items={chartRows}
                centerLabel="Candidates"
                emptyMessage={active.empty}
                measure={measure}
                selected={donutSelection}
                onSelect={pick}
              />
              <div className="mt-5">
                {/* The three states every candidate is in, along the foot of
                    the panel whose total they divide. They are shares of the
                    same fourteen the ring above is about, so they belong to
                    it rather than to a row of tiles of their own. */}
                <MiniStatStrip
                  items={[
                    {
                      label: 'Active candidates',
                      value: total - quit,
                      share: percent(total - quit, total),
                      icon: Users,
                      tone: 'brand',
                    },
                    {
                      label: 'Still in induction',
                      value: total - moved - quit,
                      share: percent(total - moved - quit, total),
                      icon: Activity,
                      tone: 'amber',
                    },
                    {
                      label: 'Dropped out',
                      value: quit,
                      share: percent(quit, total),
                      icon: XCircle,
                      tone: 'red',
                    },
                  ]}
                />
              </div>
            </Panel>

          </div>

          {/* The table view: the same numbers without relying on colour or bar
              length, plus the conversion and quit rates the marks don't
              carry. */}
          <Panel
            title={`Conversion by ${active.noun}`}
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
