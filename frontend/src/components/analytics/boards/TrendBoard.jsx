import { EmptyNote, Panel } from '@/components/analytics/Panel'
import { TrendChart } from '@/components/analytics/TrendChart'
import { DataTable } from '@/components/ui/DataTable'
import { percent } from '@/constants/analyticsPalette'

const GRANULARITY_NOTE = {
  day: 'One point per day.',
  week: 'One point per week, since the window is longer than six weeks.',
  month: 'One point per month, since the window spans more than a year.',
}

const columns = [
  { key: 'batch', header: 'Batch', render: (row) => <span className="font-medium text-slate-900">{row.batch}</span> },
  { key: 'registered', header: 'Registered', align: 'center' },
  { key: 'moved', header: 'Moved', align: 'center' },
  {
    key: 'conversion',
    header: 'Converted',
    align: 'center',
    render: (row) => (
      <span className={row.moved ? 'font-semibold text-emerald-600' : 'text-slate-400'}>
        {percent(row.moved, row.registered)}
      </span>
    ),
  },
  { key: 'quit', header: 'Quit', align: 'center' },
  {
    key: 'quit_rate',
    header: 'Quit rate',
    align: 'center',
    render: (row) => (
      <span className={row.quit ? 'font-semibold text-red-600' : 'text-slate-400'}>
        {percent(row.quit, row.registered)}
      </span>
    ),
  },
]

/**
 * Board 5 - the same numbers against time.
 *
 * The bucket size follows the window rather than being fixed, so a fortnight
 * isn't one bar and two years isn't seven hundred. The batch table underneath
 * always groups by month, because a batch IS a month here - it is the
 * comparison the business actually makes, and it wants rates rather than a
 * line.
 */
export function TrendBoard({ trend }) {
  return (
    <div className="space-y-4">
      <Panel
        title="Registrations over time"
        subtitle={`${GRANULARITY_NOTE[trend.granularity] ?? ''} Moved and quit are counted against the period the candidate registered in.`}
      >
        {trend.points.length ? (
          <TrendChart points={trend.points} granularity={trend.granularity} />
        ) : (
          <EmptyNote>Nothing registered in this window.</EmptyNote>
        )}
      </Panel>

      <Panel title="Batch against batch" subtitle="One row per month, which is what a batch is.">
        {trend.batches.length ? (
          // Newest first: the batch somebody is working right now is the one
          // they came here to compare, and it would otherwise be at the bottom
          // of a list that grows for ever.
          <DataTable columns={columns} rows={[...trend.batches].reverse()} emptyMessage="No batches in this window." />
        ) : (
          <EmptyNote>No batches in this window.</EmptyNote>
        )}
      </Panel>
    </div>
  )
}
