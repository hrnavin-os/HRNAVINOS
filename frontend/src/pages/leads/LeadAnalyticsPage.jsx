import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, PhoneCall, Tag, UserX, Users } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { StatCard } from '@/components/ui/StatCard'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { BreakdownBars } from '@/components/analytics/BreakdownBars'
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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
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
  const chartRows = isRemarks ? groupRemarks(items) : items.slice(0, 10)

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
          {/* Three figures, not three one-bar charts: each is a single number
              and a stat tile is the honest form for that. */}
          <div className="mb-4 flex flex-wrap gap-3">
            <StatCard label="Total Candidates" value={total} toneName="brand" icon={Users} />
            <StatCard label="Moved to Foundation" value={moved} toneName="emerald" icon={ArrowRightLeft} />
            <StatCard label="Quit" value={quit} toneName="red" icon={UserX} />
          </div>

          <div className="mb-4">
            <Panel
              title={isRemarks ? 'How induction calls landed' : 'Candidates by category'}
              subtitle={
                isRemarks
                  ? 'The thirty-one remarks rolled into the five outcomes they belong to. Every remark is listed below.'
                  : items.length > 10
                    ? `Top 10 of ${items.length} categories. All of them are listed below.`
                    : 'Collected on the induction call form.'
              }
            >
              <BreakdownBars
                items={chartRows}
                emptyMessage={
                  isRemarks
                    ? 'No call remarks recorded yet. Set one from the dropdown on the induction board.'
                    : 'No categories recorded yet.'
                }
              />
            </Panel>
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
