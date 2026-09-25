import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'

// One hue for the stages a lead travels through - they are one quantity at
// different points, not different things. The two ends that mean something
// wear status colours, always beside their label: confirmed is the goal, Quit
// is the exit.
const FILL = {
  batch_confirmation: '#059669',
  lost: '#dc2626',
}
const STAGE_FILL = '#3b82f6'

/**
 * Where every Foundation lead is right now, in board order. Bars are scaled to
 * the busiest stage so the shape of the funnel reads at a glance; the share of
 * all leads rides beside each count.
 */
export function PipelineFunnel({ stages }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0)
  const largest = Math.max(1, ...stages.map((stage) => stage.count))
  const confirmed = stages.find((stage) => stage.status === 'batch_confirmation')?.count ?? 0

  return (
    <div>
      <ul className="space-y-3">
        {stages.map((stage) => {
          const label = LEAD_STAGE_BY_VALUE[stage.status]?.label ?? stage.status
          return (
            <li key={stage.status} title={`${label}: ${stage.count} of ${total}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-slate-900">{stage.count}</span>
                  <span className="ml-1.5 text-xs text-slate-400">
                    {total ? `${Math.round((stage.count / total) * 100)}%` : '—'}
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${(stage.count / largest) * 100}%`,
                    backgroundColor: FILL[stage.status] ?? STAGE_FILL,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="font-semibold text-emerald-700">
          {total ? `${Math.round((confirmed / total) * 100)}%` : '0%'}
        </span>{' '}
        of all leads reached Batch Confirmation
      </p>
    </div>
  )
}
