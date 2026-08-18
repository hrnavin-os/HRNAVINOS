import { ArrowRightLeft, ClipboardList, UserPlus, UserX } from 'lucide-react'
import { DonutChart } from '@/components/analytics/DonutChart'
import { FunnelChart } from '@/components/analytics/FunnelChart'
import { Panel } from '@/components/analytics/Panel'
import { StatTile } from '@/components/analytics/StatTile'
import { SERIES, percent } from '@/constants/analyticsPalette'

/**
 * Board 1 - the shape of the whole operation: how many came in, how far each
 * step carried them, and where they went.
 *
 * The decision it supports is where to spend the next hour: a funnel that
 * leaks at "call remark set" is a calling problem, one that leaks at "moved to
 * Foundation" is a conversion problem, and the two need different people.
 */
export function FunnelBoard({ funnel }) {
  const { registered, moved, quit, in_progress: inProgress, called, detailed, stages } = funnel

  // Three outcomes that partition everyone registered, so the ring is honest:
  // every candidate is in exactly one of them and they sum to the total.
  const outcome = [
    { value: 'Moved to Foundation', count: moved, color: SERIES.moved },
    { value: 'Quit', count: quit, color: SERIES.quit },
    { value: 'Still in progress', count: inProgress, color: SERIES.registered },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Registered" value={registered} icon={UserPlus} hint="In the selected window" />
        <StatTile
          label="Moved to Foundation"
          value={moved}
          share={percent(moved, registered)}
          icon={ArrowRightLeft}
          tone="emerald"
        />
        <StatTile label="Quit" value={quit} share={percent(quit, registered)} icon={UserX} tone="red" />
        <StatTile
          label="Still in progress"
          value={inProgress}
          share={percent(inProgress, registered)}
          icon={ClipboardList}
          tone="amber"
          hint={`${called} called · ${detailed} written up`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Where the funnel narrows"
          subtitle="Each step as a share of everyone registered, with what was lost getting there."
        >
          <FunnelChart stages={stages} />
        </Panel>
        <Panel
          className="lg:col-span-2"
          title="Where they ended up"
          subtitle="Every registered candidate is in exactly one of these three."
        >
          <DonutChart items={outcome} centerLabel="Candidates" emptyMessage="Nothing registered in this window." />
        </Panel>
      </div>
    </div>
  )
}
