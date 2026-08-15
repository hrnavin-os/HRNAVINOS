import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Crown, Megaphone, PhoneCall, Tag, UserRound, UserX } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { TableCard } from '@/components/ui/TableCard'
import { TabStrip } from '@/components/ui/TabStrip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { DonutChart } from '@/components/analytics/DonutChart'
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
    subtitle: 'The thirty-one remarks grouped into the five outcomes they belong to.',
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

const FIGURE_TONES = {
  emerald: { wash: 'from-emerald-50/70', plate: 'bg-emerald-100 text-emerald-600', pill: 'bg-emerald-100 text-emerald-700' },
  red: { wash: 'from-red-50/70', plate: 'bg-red-100 text-red-600', pill: 'bg-red-100 text-red-700' },
  brand: { wash: 'from-brand-50/70', plate: 'bg-brand-100 text-brand-600', pill: 'bg-brand-100 text-brand-700' },
}

// A single number, what share of the whole it is, and nothing else. Not a
// chart: one figure against a total is a figure, and a one-slice pie would say
// the same thing with more ink.
//
// The share sits in a tinted pill beside the value rather than as a line of
// text under it - it is the comparison the number is only meaningful against,
// so it belongs on the same baseline, not in a footnote.
function Figure({ label, value, share, icon: Icon, tone = 'brand' }) {
  const style = FIGURE_TONES[tone] ?? FIGURE_TONES.brand
  // A count gets the big numeral; a name gets a readable size instead. Set at
  // 2xl, "Referral - existing student" wraps to three lines and the card grows
  // to twice its neighbours.
  const isName = typeof value === 'string'
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* A wash behind the figure rather than a flat white card, so the row
          reads as three related things and not three empty boxes. */}
      <div className={`absolute inset-0 -z-10 bg-linear-to-br ${style.wash} to-transparent`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-2">
            <span
              className={`font-bold leading-tight text-slate-900 ${
                isName ? 'line-clamp-2 text-sm' : 'text-2xl leading-none'
              }`}
              title={isName ? value : undefined}
            >
              {value}
            </span>
            {share && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.pill}`}>{share}</span>
            )}
          </p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.plate}`}>
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
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

// Every category the form offers, whether anyone has been put in it or not.
//
// The aggregation can only return values that exist in the data, so a category
// nobody has been filed under is simply absent - and absent reads as "doesn't
// exist" rather than "nobody yet", which are very different findings. The list
// of what could have been chosen is the form config, so the two are merged
// here: the configured options at zero, then whatever the data holds.
function withEmptyCategories(items, options) {
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
  const [tab, setTab] = useState('category')

  const query = useQuery({
    queryKey: ['induction-analytics', tab],
    queryFn: () => inductionEntryService.getAnalytics(tab),
    // Holds the previous breakdown while the next loads, so switching tabs
    // doesn't collapse the page to a spinner and back.
    placeholderData: (previous) => previous,
  })

  // The admin-editable option list behind the form's Category dropdown. Read
  // from the config rather than hardcoded, so adding a category in Admin >
  // Form Collection puts it on this board at zero without a deploy. Gated by
  // LEADS_VIEW, the same permission as this page.
  const configQuery = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: inductionFormConfigService.get,
  })
  const categoryOptions =
    configQuery.data?.fields?.find((field) => field.key === 'category')?.options ?? []

  const data = query.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const moved = items.reduce((sum, item) => sum + item.moved, 0)
  const quit = items.reduce((sum, item) => sum + item.quit, 0)
  // The API returns rows sorted by count descending, so the head is the biggest
  // group. Read rather than re-sorted, so the card and the table can't disagree.
  const largest = items[0] ?? null

  const active = TAB_BY_KEY[tab]
  // Category is the one dimension with an authoritative list of what the
  // answers could have been, so it is the one that can show the empties. Sales
  // person and lead source are free text - there is no roster of salespeople
  // the form knows about, so "every value at zero" isn't a set that exists.
  const rows = tab === 'category' ? withEmptyCategories(items, categoryOptions) : items
  // Remarks are the one dimension with a fixed vocabulary worth folding: 31
  // options that belong to five outcomes. The others go to the donut as they
  // come, and it folds its own tail into "Other" past six. No slicing here
  // either, or those rows would leave the total the ring is showing.
  const chartRows = tab === 'call_remark' ? groupRemarks(items) : rows

  const columns = [
    {
      key: 'value',
      header: active.column,
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
      {/* Title and tabs on one line. The Topbar already says "Dashboard"; this
          says which dashboard, which the header cannot because it reads the
          nav label. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
          <p className="mt-0.5 text-sm text-amber-600">
            Induction call insights &amp; candidate categorization
          </p>
        </div>

        {/* Takes the width the title leaves and divides it four ways, so the
            tabs stay equal without the strip needing a row of its own. The
            basis is the wrap trigger rather than a size: once the title and
            the strip can no longer both have their share, the strip drops to
            its own full-width line instead of squeezing four labels into the
            corner. */}
        <TabStrip equal tabs={TABS} value={tab} onChange={setTab} className="min-w-0 flex-1 basis-lg" />
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
            <Panel title={active.title} subtitle={active.subtitle}>
              <DonutChart items={chartRows} centerLabel="Candidates" emptyMessage={active.empty} />
            </Panel>

            {/* Content-height, not stretched: short cards pulled to the full
                height of a chart panel are cards of empty space. */}
            <div className="grid grid-cols-1 gap-4 self-start sm:grid-cols-3 lg:grid-cols-1">
              <Figure
                label="Moved to Foundation"
                value={moved}
                share={percent(moved, total)}
                icon={ArrowRightLeft}
                tone="emerald"
              />
              <Figure label="Quit" value={quit} share={percent(quit, total)} icon={UserX} tone="red" />
              {/* A real third figure rather than the decorative tile the
                  mock-up used - the biggest group and how much of the intake
                  it is, which is the first thing anybody asks of a breakdown.
                  Reads the top row, which the API already sorts by count. */}
              <Figure
                label={active.leader}
                value={largest ? largest.value : '—'}
                share={largest ? percent(largest.count, total) : null}
                icon={Crown}
                tone="brand"
              />
            </div>
          </div>

          {/* The table view: the same numbers without relying on colour or bar
              length, plus the conversion and quit rates the bars don't carry.
              Fed from `rows`, the same list the chart gets, so an empty
              category appears in both or neither. */}
          <TableCard>
            <DataTable
              columns={columns}
              rows={rows.map((item) => ({ id: item.value, ...item }))}
              emptyMessage="Nothing recorded yet."
            />
          </TableCard>
        </div>
      )}
    </div>
  )
}
