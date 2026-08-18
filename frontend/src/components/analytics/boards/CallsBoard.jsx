import { AlarmClock, PhoneCall, PhoneOff } from 'lucide-react'
import { BarList } from '@/components/analytics/BarList'
import { DonutChart } from '@/components/analytics/DonutChart'
import { EmptyNote, Panel } from '@/components/analytics/Panel'
import { StatTile } from '@/components/analytics/StatTile'
import { WAIT, percent } from '@/constants/analyticsPalette'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'

// The nineteen remarks rolled up into the six outcomes they belong to.
// Nineteen slices is a list, not a chart; the individual wordings keep their
// detail in the bars beside it.
function byOutcome(remarks) {
  const totals = REMARK_GROUPS.map((group) => ({ value: group.label, color: group.color, count: 0 }))
  const byLabel = Object.fromEntries(totals.map((row) => [row.value, row]))
  let unknown = 0
  for (const row of remarks) {
    const group = REMARK_GROUP_BY_VALUE[row.value]
    if (group) byLabel[group.label].count += row.count
    else unknown += row.count
  }
  // "Not set", and anything typed before an option existed. Named rather than
  // dropped: the ring's total has to agree with the board's.
  return unknown ? [...totals, { value: 'No remark yet', color: '#94a3b8', count: unknown }] : totals
}

/**
 * Board 2 - what happened on the phone.
 *
 * Two decisions live here. The outcome ring says whether the calling is
 * working; the waiting bars say who is being left behind, which is the one
 * thing the remarks themselves can never show - an entry nobody has touched
 * has no remark to appear under.
 */
export function CallsBoard({ calls, total }) {
  const named = calls.remarks.filter((row) => row.value !== 'Not set')
  const waiting = calls.waiting.map((row) => ({ value: row.bucket, count: row.count }))
  const oldest = calls.waiting.at(-1)
  const called = total - calls.uncalled

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Calls recorded"
          value={called}
          share={percent(called, total)}
          icon={PhoneCall}
          tone="emerald"
        />
        <StatTile
          label="Nobody has called yet"
          value={calls.uncalled}
          share={percent(calls.uncalled, total)}
          icon={PhoneOff}
          tone="amber"
          hint="Still in the queue, no remark set"
        />
        <StatTile
          label="Waiting over a fortnight"
          value={oldest?.count ?? 0}
          icon={AlarmClock}
          tone={oldest?.count ? 'red' : 'slate'}
          hint="Registered 15+ days ago, never called"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="How the calls landed"
          subtitle="The nineteen remarks grouped into the six outcomes they belong to."
        >
          <DonutChart
            items={byOutcome(calls.remarks)}
            centerLabel="Candidates"
            emptyMessage="No call remarks recorded yet. Set one from the dropdown on the induction board."
          />
        </Panel>
        <Panel
          className="lg:col-span-2"
          title="Waiting to be called"
          subtitle="Uncalled entries by how long they have been waiting."
        >
          {calls.waiting.some((row) => row.count) ? (
            <BarList items={waiting} color={WAIT} sorted={false} limit={4} />
          ) : (
            <EmptyNote>Nobody is waiting - every entry in this window has a remark.</EmptyNote>
          )}
        </Panel>
      </div>

      <Panel title="Every remark used" subtitle="The exact wording the caller chose, most used first.">
        {named.length ? <BarList items={named} limit={12} /> : <EmptyNote>No remarks recorded yet.</EmptyNote>}
      </Panel>
    </div>
  )
}
