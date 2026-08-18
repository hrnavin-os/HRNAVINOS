import { BarList } from '@/components/analytics/BarList'
import { DonutChart } from '@/components/analytics/DonutChart'
import { EmptyNote, Panel } from '@/components/analytics/Panel'
import { DataTable } from '@/components/ui/DataTable'
import { percent } from '@/constants/analyticsPalette'

const columns = [
  {
    key: 'value',
    header: 'Lead source',
    render: (row) => <span className="font-medium text-slate-900">{row.value}</span>,
  },
  { key: 'count', header: 'Candidates', align: 'center' },
  { key: 'moved', header: 'Moved', align: 'center' },
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
  { key: 'quit', header: 'Quit', align: 'center' },
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

/**
 * Board 4 - where candidates come from and what kind they are.
 *
 * The volume ring is the obvious half and the least useful: the decision this
 * board exists for is which channel to spend more on, and that is the
 * conversion column in the table, not the size of the slice. A source can be
 * the biggest on the ring and the worst in the table, which is exactly the
 * case worth catching.
 */
export function ChannelsBoard({ channels }) {
  const { lead_source: sources, category, payment_mode: payment } = channels

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Lead source" subtitle="Which channel the candidate arrived through.">
          <DonutChart items={sources} centerLabel="Candidates" emptyMessage="No lead source recorded yet." />
        </Panel>
        <Panel title="Category" subtitle="What the induction form recorded about where they are now.">
          <DonutChart items={category} centerLabel="Candidates" emptyMessage="No category recorded yet." />
        </Panel>
      </div>

      <Panel
        title="Which source actually converts"
        subtitle="Volume is the ring above; this is whether the volume was worth having."
      >
        {sources.length ? (
          <DataTable columns={columns} rows={sources} emptyMessage="No lead source recorded yet." />
        ) : (
          <EmptyNote>No lead source recorded on any entry in this window.</EmptyNote>
        )}
      </Panel>

      <Panel title="Payment mode" subtitle="How the fee was settled, where it was recorded.">
        {payment.length ? <BarList items={payment} limit={8} /> : <EmptyNote>No payment mode recorded yet.</EmptyNote>}
      </Panel>
    </div>
  )
}
