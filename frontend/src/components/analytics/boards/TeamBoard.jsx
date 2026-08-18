import { BarList } from '@/components/analytics/BarList'
import { EmptyNote, Panel } from '@/components/analytics/Panel'
import { DataTable } from '@/components/ui/DataTable'
import { percent } from '@/constants/analyticsPalette'

// Bars answer "who has the most"; the table answers "whose convert". Both are
// present on purpose - the ranking is the picture, the rates are the finding,
// and a rate is not something a bar chart should be asked to show when the
// counts behind it differ by an order of magnitude.
const columns = [
  { key: 'value', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.value}</span> },
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
    key: 'uncalled',
    header: 'Not called',
    align: 'center',
    render: (row) => (
      <span className={row.uncalled ? 'font-semibold text-amber-600' : 'text-slate-400'}>{row.uncalled}</span>
    ),
  },
]

/**
 * Board 3 - the two people on an entry.
 *
 * Sales person is who the form credits with bringing the candidate in;
 * assignee is the Section Admin the round-robin gave them to. Deliberately not
 * merged into one "team" list: they answer different questions, and a name can
 * appear in both with completely different numbers.
 *
 * The decision here is where to move work. A high count with a low conversion
 * is coaching; a high "not called" is capacity.
 */
export function TeamBoard({ team }) {
  return (
    <div className="space-y-4">
      <Section
        title="By sales person"
        subtitle="Credited on the induction form. Who brought the candidate in."
        rows={team.sales_person}
        empty="No sales person recorded on any entry in this window."
      />
      <Section
        title="By assignee"
        subtitle="The Section Admin the entry was assigned to. Who is working it now."
        rows={team.assignee}
        empty="Nothing assigned in this window."
      />
    </div>
  )
}

function Section({ title, subtitle, rows, empty }) {
  if (!rows.length) {
    return (
      <Panel title={title} subtitle={subtitle}>
        <EmptyNote>{empty}</EmptyNote>
      </Panel>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel className="lg:col-span-2" title={title} subtitle={subtitle}>
        <BarList items={rows} limit={8} />
      </Panel>
      <Panel className="lg:col-span-3" title={`${title} - the numbers`} subtitle="Every value, including the tail.">
        <DataTable columns={columns} rows={rows} emptyMessage={empty} />
      </Panel>
    </div>
  )
}
