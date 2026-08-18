import { ArrowDown } from 'lucide-react'
import { BAR } from '@/constants/analyticsPalette'

/**
 * The four steps of an induction entry's life, as bars whose width is their
 * share of everyone registered.
 *
 * Bars rather than the tapered trapezoid a "funnel chart" usually means: the
 * taper encodes the same number twice, once in the width and once in the
 * sloping sides, and the slope is the half nobody can read a value off. A
 * left-aligned bar per stage compares by length against a common baseline,
 * which is the one comparison the eye is good at.
 *
 * Between the bars sits the drop - how many were lost at that step and what
 * that is as a share. The drop is the finding; the stage counts are just where
 * it happened.
 */
export function FunnelChart({ stages }) {
  const top = stages[0]?.count ?? 0

  return (
    <ol className="space-y-1">
      {stages.map((stage, index) => {
        const previous = stages[index - 1]
        const lost = previous ? previous.count - stage.count : 0
        return (
          <li key={stage.key}>
            {previous && (
              <div className="flex items-center gap-2 py-1 pl-1 text-xs">
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden="true" />
                <span className={lost ? 'font-medium text-slate-500' : 'text-slate-400'}>
                  {lost
                    ? `${lost} did not reach this step (${Math.round((lost / previous.count) * 100)}% of the step above)`
                    : 'Everyone from the step above'}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-700">{stage.label}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {stage.count}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">{stage.share}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-3 w-full overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="h-full rounded-md transition-[width] duration-300"
                    style={{
                      width: `${top ? Math.max((stage.count / top) * 100, stage.count ? 2 : 0) : 0}%`,
                      backgroundColor: BAR,
                      // Lighter as the funnel narrows, so the steps read in
                      // order at a glance. One hue throughout - the stages are
                      // one measure at four depths, not four identities.
                      opacity: 1 - index * 0.18,
                    }}
                  />
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
