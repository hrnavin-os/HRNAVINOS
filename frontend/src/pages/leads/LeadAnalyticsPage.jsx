import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, PhoneCall, Tag, UserX } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { DonutChart } from '@/components/analytics/DonutChart'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'

const TABS = [
  { key: 'category', label: 'Category', icon: Tag },
  { key: 'call_remark', label: 'Induction Call Remarks', icon: PhoneCall },
]

// The bar colour for a remark group. Validated as a five-slot categorical
// palette (worst adjacent CVD deltaE 25.2) - two of them sit under 3:1 against
// white, which is why every bar is labelled and the table below repeats the
// numbers rather than colour carrying them alone.
const GROUP_COLOR = {
  done: '#10b981',
  scheduled: '#3b82f6',
  chasing: '#f59e0b',
  moved: '#8b5cf6',
  quit: '#ef4444',
}

function percent(part, whole) {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

// A single number and what share of the whole it is. Not a chart: one figure
// against a total is a figure, and a one-slice pie would say the same thing
// with more ink.
//
// Laid out across rather than down. Stacked, the icon, label, value and share
// made a card twice the height it needed and the pair left a column of empty
// white beside a chart that is mostly whitespace already.
function Figure({ label, value, share, icon: Icon, tone }) {
  const plate = tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
  const accent = tone === 'emerald' ? 'text-emerald-600' : 'text-red-600'
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${plate}`}>
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none text-slate-900">{value}</span>
          <span className={`text-xs font-semibold ${accent}`}>{share}</span>
        </p>
      </div>
    </div>
  )
}

// Rolls the individual remarks up into the five groups the board already
// colours by. Thirty-one bars is a list, not a chart - the useful shape is how
// the calls landed across five kinds of outcome, and the full detail stays in
// the table underneath.
function groupRemarks(items) {
  const totals = REMARK_GROUPS.map((group) => ({
    value: group.label,
    color: GROUP_COLOR[group.key],
    count: 0,
  }))
  const byLabel = Object.fromEntries(totals.map((row) => [row.value, row]))
  let ungrouped = 0

  for (const item of items) {
    const group = REMARK_GROUP_BY_VALUE[item.value]
    if (group) byLabel[group.label].count += item.count
    else ungrouped += item.count
  }

  const rows = totals.filter((row) => row.count > 0)
  // "Not set" and anything typed before the dropdown existed. Named rather
  // than dropped: how much of the data is missing is itself a finding.
  if (ungrouped) rows.push({ value: 'No remark yet', color: '#94a3b8', count: ungrouped })
  return rows.sort((a, b) => b.count - a.count)
}

export function LeadAnalyticsPage() {
  const [tab, setTab] = useState('category')

  const query = useQuery({
    queryKey: ['induction-analytics', tab],
    queryFn: () => inductionEntryService.getAnalytics(tab),
    // Holds the previous breakdown while the next loads, so switching tabs
    // doesn't collapse the page to a spinner and back.
    placeholderData: (previous) => previous,
  })

  const data = query.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const moved = items.reduce((sum, item) => sum + item.moved, 0)
  const quit = items.reduce((sum, item) => sum + item.quit, 0)

  const isRemarks = tab === 'call_remark'
  // No slicing here - the donut folds its own tail into "Other" past six, and
  // truncating first would drop those rows from the total the ring is showing.
  const chartRows = isRemarks ? groupRemarks(items) : items

  const columns = [
    {
      key: 'value',
      header: isRemarks ? 'Call Remark' : 'Category',
      render: (row) => <span className="font-medium text-slate-900">{row.value}</span>,
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
      {/* One row of tabs above everything they scope, rather than a control
          inside each panel. */}
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === item.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      <ErrorMessage message={query.error ? getApiErrorMessage(query.error) : null} />

      {query.isLoading && !data ? (
        <LoadingSpinner />
      ) : (
        // Dimmed rather than replaced while refetching, so the page doesn't
        // jump between a skeleton and content on every tab switch.
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* The split, and the two figures that qualify it, side by side. The
              total moved into the donut's centre when the stat cards came out -
              it is the total OF that ring, so it belongs in it. Moved and Quit
              stay as figures because each is a single number, which a slice of
              a different pie would not have said any better. */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_15rem]">
            <Panel
              title={isRemarks ? 'How induction calls landed' : 'Candidates by category'}
              subtitle={
                isRemarks
                  ? 'The thirty-one remarks grouped into the five outcomes they belong to.'
                  : 'Collected on the induction call form.'
              }
            >
              <DonutChart
                items={chartRows}
                centerLabel="Candidates"
                emptyMessage={
                  isRemarks
                    ? 'No call remarks recorded yet. Set one from the dropdown on the induction board.'
                    : 'No categories recorded yet.'
                }
              />
            </Panel>

            {/* Content-height, not stretched: two short cards pulled to the
                full height of a chart panel are two cards of empty space. */}
            <div className="grid grid-cols-1 gap-4 self-start sm:grid-cols-2 lg:grid-cols-1">
              <Figure
                label="Moved to Foundation"
                value={moved}
                share={percent(moved, total)}
                icon={ArrowRightLeft}
                tone="emerald"
              />
              <Figure label="Quit" value={quit} share={percent(quit, total)} icon={UserX} tone="red" />
            </div>
          </div>

          {/* The table view: the same numbers without relying on colour or bar
              length, plus the conversion and quit rates the bars don't carry. */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <DataTable
              columns={columns}
              rows={items.map((item) => ({ id: item.value, ...item }))}
              emptyMessage="Nothing recorded yet."
            />
          </div>
        </div>
      )}
    </div>
  )
}
