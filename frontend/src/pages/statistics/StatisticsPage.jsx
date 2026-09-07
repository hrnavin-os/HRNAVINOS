import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Wallet, X } from 'lucide-react'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { useLeadBoard } from '@/hooks/useLeadBoard'
import { DataTable } from '@/components/ui/DataTable'
import { DateFilter } from '@/components/ui/DateFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { TabStrip } from '@/components/ui/TabStrip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { foldToSlices } from '@/components/analytics/DonutChart'
import { BreakdownVisual, VisualPicker, visualsFor } from '@/components/analytics/BreakdownVisual'
import { Panel, SegmentedToggle } from '@/components/analytics/Panel'
import { MiniStatStrip, StatTile } from '@/components/analytics/StatTile'
import { percent } from '@/constants/analyticsPalette'
import { BOARDS, BOARD_BY_KEY, shortMoney } from '@/constants/statisticsBoards'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'
import { formatCurrency } from '@/utils/formatters'

const MEASURES = [
  { value: 'count', label: 'Count' },
  { value: 'share', label: 'Percentage' },
]

// Rolls the individual remarks up into the six groups the board already
// colours by. Nineteen slices is a list, not a chart - the useful shape is how
// the calls landed across six kinds of outcome, and the individual wordings
// keep their detail in the table beside the ring.
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
// entries, or a course nobody enrolled on, is exactly the thing this board
// should be able to say out loud.
function withExpectedValues(items, expected, zero) {
  if (!expected.length) return items
  const byValue = new Map(items.map((item) => [item.value, item]))
  const configured = expected.map((value) => byValue.get(value) ?? { ...zero, value })
  // Values the data carries that the dropdown no longer offers: "Not set", and
  // anything recorded before an option was renamed or removed. Dropping them
  // would leave the chart's total disagreeing with the board's count.
  const unlisted = items.filter((item) => !expected.includes(item.value))
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

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

/**
 * The Statistics board: the institute's intake, read two ways.
 *
 * Induction is everyone who took the call; Foundation is everyone who came out
 * of it and filled the form. Two populations, the same questions asked of
 * both - so one page with one set of panels, and everything that differs
 * between the halves described in constants/statisticsBoards rather than
 * branched on here.
 */
export function StatisticsPage() {
  const { user } = useAuth()
  // A Section Admin is pinned to their own section by their role, exactly as
  // on the board - so the filter isn't offered to them rather than offered
  // and then ignored.
  const scopedSection = user?.scoped_section || null

  // Which half is showing lives in the URL, the same ?board= the Lead
  // Dashboard's own Induction/Foundation switch uses - so the switch behaves
  // identically on both pages, and a board is linkable and survives a refresh.
  const [boardKey, setBoardKey] = useLeadBoard()
  const board = BOARD_BY_KEY[boardKey] ?? BOARDS[0]

  // One open tab per board, remembered separately: coming back to Induction
  // should land where you left it rather than resetting to the first tab.
  const [tabs, setTabs] = useState(() =>
    Object.fromEntries(BOARDS.map((item) => [item.key, item.dimensions[0].key])),
  )
  const [dateRange, setDateRange] = useState(null)
  const [section, setSection] = useState('')
  const [measure, setMeasure] = useState('count')
  const [view, setView] = useState('donut')
  // The highlighted value, shared by every view on the canvas. One string
  // rather than a per-panel selection: the whole point of a dashboard is that
  // the panels are looking at the same thing.
  const [selected, setSelected] = useState(null)

  const dimension =
    board.dimensions.find((item) => item.key === tabs[board.key]) ?? board.dimensions[0]

  function openTab(key) {
    setTabs((current) => ({ ...current, [board.key]: key }))
    // A value picked on one dimension means nothing on the next - "Meta-2" is
    // not a category - so the highlight clears with the tab.
    setSelected(null)
  }

  function openBoard(key) {
    setBoardKey(key)
    setSelected(null)
  }

  const filters = {
    date_from: dateRange?.from || undefined,
    date_to: dateRange?.to || undefined,
    section: section || undefined,
  }

  const query = useQuery({
    queryKey: ['statistics', board.key, dimension.key, filters],
    queryFn: () => board.load(dimension.key, filters),
    // Holds the previous breakdown while the next loads, so switching tabs or
    // moving a filter doesn't collapse the page to a spinner and back.
    placeholderData: (previous) => previous,
  })

  // The admin-editable option lists behind the induction form's dropdowns,
  // keyed by field. Read from the config rather than hardcoded, so adding a
  // category or a salesperson in Admin > Form Collection puts them on this
  // board at zero without a deploy.
  const configQuery = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: inductionFormConfigService.get,
    enabled: board.key === 'induction',
  })
  const inductionOptions = Object.fromEntries(
    (configQuery.data?.fields ?? []).map((field) => [field.key, field.options ?? []]),
  )

  // Every live course, so one nobody has enrolled on still shows at zero.
  const courseQuery = useQuery({
    queryKey: ['lead-course-catalog'],
    queryFn: leadService.getCourseCatalog,
    enabled: board.key === 'foundation',
  })

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

  // A row with every measure at zero, for the values nobody has been filed
  // under. Built from the board's own measures so a new one can't be missed
  // here and show up as an undefined in a chart.
  const zero = {
    count: 0,
    ...Object.fromEntries(board.outcomes.map((outcome) => [outcome.key, 0])),
    ...(board.money ? { [board.money.key]: 0 } : {}),
  }
  const expected = dimension.expected?.({ inductionOptions, courses: courseQuery.data ?? [] }) ?? []
  const rows = withExpectedValues(items, expected, zero).map((row) =>
    // Stored values are enum keys on some dimensions ("emi_6_weeks"); the
    // wording belongs to the constants every other surface names them from,
    // so it is mapped here rather than sent down from the API.
    dimension.labelOf ? { ...row, value: dimension.labelOf(row.value) } : row,
  )
  // The call-remark chart is a level up from its table: nineteen wordings roll
  // into the six outcomes they belong to.
  const chartRows = dimension.grouped ? groupRemarks(items) : rows

  // The API returns rows biggest-first, so the head is the largest group. Read
  // rather than re-sorted, so the tile and the table can't disagree.
  const largest = items[0] ?? null

  // What the period arrows compare. Not always the headline figures: with no
  // window set the board totals everything, and there is no period before all
  // time - so the server measures the last thirty days against the thirty
  // before and says so in the label.
  const now = data?.current
  const before = data?.comparison

  // The ring's own colour assignment, read back so the ranking and the table
  // can wear it too. The same entity keeps the same colour in every view,
  // which is what lets a reader carry one across to another.
  const colors = new Map(foldToSlices(chartRows).map((slice) => [slice.value, slice.color]))

  // On the remarks tab the chart shows outcomes while the table shows the
  // wordings inside them - so a highlight has to travel between the two
  // levels. One string does it in both directions: a picked outcome lights
  // every remark in it, and a picked remark lights its outcome.
  const groupOf = (value) => (dimension.grouped ? REMARK_GROUP_BY_VALUE[value]?.label : undefined)
  const isRowSelected = (row) => !selected || row.value === selected || groupOf(row.value) === selected
  const chartSelection = selected ? groupOf(selected) ?? selected : null
  const pick = (value) => setSelected((current) => (current === value ? null : value))

  // With something picked, the tiles answer for it rather than for everyone -
  // which is the question that was just asked by clicking on it.
  const focus = selected ? rows.filter((row) => isRowSelected(row)) : rows
  const focusCount = sum(focus, 'count')

  // Which chart types this dimension can honestly be drawn as, and the one
  // showing. Falls back rather than resetting state: leaving the trend on the
  // batch tab and switching to courses must not draw a line across categories.
  const visuals = visualsFor(dimension)
  const activeView = visuals.some((visual) => visual.value === view) ? view : 'donut'

  const columns = [
    {
      key: 'value',
      header: dimension.column,
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
          {/* A batch is named by a number, which says nothing to anybody who
              wasn't there - so the month it is rides beside it. */}
          {row.period && <span className="text-xs font-normal text-slate-400">{row.period}</span>}
        </span>
      ),
    },
    { key: 'count', header: board.unit, align: 'center', numeric: true },
    ...board.outcomes.flatMap((outcome) => [
      { key: outcome.key, header: outcome.label, align: 'center', numeric: true },
      {
        key: `${outcome.key}_rate`,
        header: outcome.rateLabel,
        align: 'center',
        render: (row) => (
          <span
            className={
              row[outcome.key]
                ? `font-semibold ${outcome.tone === 'red' ? 'text-red-600' : 'text-emerald-600'}`
                : 'text-slate-400'
            }
          >
            {percent(row[outcome.key], row.count)}
          </span>
        ),
      },
    ]),
    ...(board.money
      ? [
          {
            key: board.money.key,
            header: board.money.label,
            align: 'center',
            render: (row) => (
              <span className={row[board.money.key] ? 'font-semibold text-slate-900' : 'text-slate-400'}>
                {formatCurrency(row[board.money.key])}
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      {/* The control deck: which half of the institute, which way it is cut,
          and the window it covers - one card in three bands rather than three
          rows floating on the page. Everything that answers "what am I looking
          at" is then one block at the top, and the panels below start where
          the reading starts. */}
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              {/* The Topbar reads the nav label, so it only says "Statistics";
                  this names the half being read, which that header cannot. */}
              <h1 className="text-base font-semibold tracking-tight text-slate-900">{board.title}</h1>
              <p className="text-[11px] font-medium text-amber-600">{board.caption}</p>
            </div>
          </div>
          {/* The primary switch: two populations, not two more dimensions. It
              keeps its own row-end position and Foundation keeps the violet it
              wears on the Lead Dashboard, so the two switches read as the same
              control in two places. */}
          <TabStrip tabs={BOARDS} value={board.key} onChange={openBoard} />
        </div>

        <div className="border-t border-slate-200 px-4 py-2.5">
          <TabStrip equal tabs={board.dimensions} value={dimension.key} onChange={openTab} />
        </div>

        {/* The filter band. One window and one section for every view on the
            canvas, so two panels on the same screen can never end up
            describing different populations - the failure that makes a
            dashboard untrustworthy rather than merely wrong. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Filters</span>
          <div className="w-56">
            <DateFilter grow label={board.dateLabel} value={dateRange} onChange={setDateRange} />
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
            {selected ? `${focusCount} of ${total} highlighted` : board.scopeLabel(total)}
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
          <div
            className={`mb-3 grid gap-3 sm:grid-cols-2 ${board.money ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
          >
            <StatTile
              label={selected ? board.highlightLabel : board.totalLabel}
              value={focusCount}
              share={selected ? percent(focusCount, total) : null}
              delta={selected ? undefined : change(now?.total, before?.total)}
              deltaLabel={selected ? `of ${total} in scope` : before?.label}
              icon={board.icon}
            />
            {board.outcomes.map((outcome) => (
              <StatTile
                key={outcome.key}
                label={outcome.label}
                value={sum(focus, outcome.key)}
                share={percent(sum(focus, outcome.key), focusCount)}
                delta={selected ? undefined : change(now?.[outcome.key], before?.[outcome.key])}
                deltaLabel={selected ? null : before?.label}
                // Some figures are bad news when they rise - more people
                // quitting is not good news, whichever way the arrow points.
                invert={outcome.invert}
                icon={outcome.icon}
                tone={outcome.tone}
              />
            ))}
            {board.money && (
              // No period arrow: the comparison the server sends back counts
              // people, not money, and an arrow with nothing behind it is
              // worse than none.
              <StatTile
                label={board.money.label}
                value={shortMoney(sum(focus, board.money.key))}
                deltaLabel={`across ${focusCount} ${board.unit.toLowerCase()}`}
                icon={Wallet}
                tone="amber"
              />
            )}
            <StatTile
              label={dimension.leader}
              value={largest ? dimension.labelOf?.(largest.value) ?? largest.value : '—'}
              share={largest ? percent(largest.count, total) : null}
              deltaLabel={largest ? `${largest.count} ${board.unit.toLowerCase()}` : null}
              icon={Crown}
            />
          </div>

          <div className="mb-3">
            <Panel
              className="min-w-0"
              title={dimension.title}
              subtitle={dimension.subtitle}
              hint={dimension.hint}
              action={
                // Two switches, not one control with seven states: what is
                // being drawn and which figure leads are independent choices,
                // and every combination is a reading somebody wants.
                <div className="flex flex-wrap items-center gap-2">
                  <VisualPicker visuals={visuals} value={activeView} onChange={setView} />
                  <SegmentedToggle
                    label="Show counts or percentages"
                    options={MEASURES}
                    value={measure}
                    onChange={setMeasure}
                  />
                </div>
              }
            >
              <BreakdownVisual
                view={activeView}
                items={chartRows}
                unit={board.unit}
                empty={dimension.empty}
                measure={measure}
                ordered={Boolean(dimension.ordered)}
                selected={chartSelection}
                onSelect={pick}
              />
              <div className="mt-5">
                {/* The states every row is in, along the foot of the panel
                    whose total they divide. They are shares of the same
                    population the chart above is about, so they belong to it
                    rather than to a row of tiles of their own. */}
                <MiniStatStrip
                  items={board
                    .foot({
                      total,
                      ...Object.fromEntries(
                        board.outcomes.map((outcome) => [outcome.key, sum(rows, outcome.key)]),
                      ),
                    })
                    .map((item) => ({ ...item, share: percent(item.value, item.of) }))}
                />
              </div>
            </Panel>
          </div>

          {/* The table view: the same numbers without relying on colour or bar
              length, plus the rates the marks don't carry. */}
          <Panel
            title={`Conversion by ${dimension.noun}`}
            subtitle="Every value, including the ones nobody has been filed under."
          >
            <DataTable
              columns={columns}
              rows={rows}
              emptyMessage={dimension.empty}
              onRowClick={(row) => pick(row.value)}
            />
          </Panel>
        </div>
      )}
    </div>
  )
}
