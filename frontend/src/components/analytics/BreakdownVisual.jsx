import { ChartBar, ChartColumn, ChartLine, ChartPie, LayoutGrid } from 'lucide-react'
import { DonutChart } from '@/components/analytics/DonutChart'
import { CategoryBars } from '@/components/analytics/CategoryBars'
import { ColumnChart } from '@/components/analytics/ColumnChart'
import { TrendChart } from '@/components/analytics/TrendChart'
import { TreemapChart } from '@/components/analytics/TreemapChart'

/**
 * One breakdown, drawn every way it can honestly be drawn - all of them at
 * once, on one canvas.
 *
 * Four visuals over one set of numbers, because they answer four different
 * questions and none of them is the "best" chart:
 *
 *   Donut    how the whole divides - the shape of it, at a glance
 *   Bars     which is biggest and by how much, on a common baseline (the only
 *            encoding small differences can be read off accurately)
 *   Columns  the same comparison with nothing folded away, so twenty values
 *            are all still there
 *   Treemap  part-to-whole when there are too many values for a ring
 *   Trend    the shape between periods - climbing, flat or falling
 *
 * They sit together as small multiples rather than behind a picker. The
 * questions above get asked one after another - which category is biggest,
 * then what share of the intake it is - and answering the second used to mean
 * clicking to another view and holding the first in your head. Side by side
 * the eye does that for free, and the page costs a scroll instead.
 *
 * The trend is offered only where the values sit on an axis. A line drawn
 * across categories asserts that the gap between two of them means something,
 * and between "Data Science" and "Full Stack" it means nothing - so on those
 * dimensions the view isn't drawn rather than being drawn and lying. Where it
 * is drawn it takes the full width: a line is read along its length, and it is
 * the one view here that a half-width cell actually cramps.
 *
 * Every visual takes the same selection, so a value picked in one is picked in
 * all of them - which on a single canvas is something a reader watches happen
 * rather than something they discover later.
 */
export const VISUALS = [
  { value: 'donut', label: 'Donut', icon: ChartPie },
  { value: 'bars', label: 'Bars', icon: ChartBar },
  { value: 'columns', label: 'Columns', icon: ChartColumn },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid },
  // See above: temporal dimensions only.
  { value: 'trend', label: 'Trend', icon: ChartLine, orderedOnly: true, wide: true },
]

export function visualsFor(dimension) {
  return VISUALS.filter((visual) => !visual.orderedOnly || dimension.ordered)
}

/**
 * The four views of one breakdown, in a 2x2 grid.
 *
 * Each cell is framed and captioned with the name of the chart it holds. The
 * frame is doing real work at this density: four charts loose in one card read
 * as one enormous confusing chart, and the caption is what lets somebody say
 * which of them they are talking about.
 *
 * Two columns from xl up and one below it. The ring carries its legend table
 * beside it and the columns want room per bar, so narrower than that a
 * half-width cell isn't a smaller chart - it's a truncated one.
 */
export function BreakdownGrid({ visuals, ...shared }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {visuals.map((visual) => (
        <figure
          key={visual.value}
          className={`min-w-0 overflow-hidden rounded-lg border border-slate-200 ${
            visual.wide ? 'xl:col-span-2' : ''
          }`}
        >
          <figcaption className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <visual.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            {visual.label}
          </figcaption>
          <div className="min-w-0 px-3 py-4">
            <BreakdownVisual view={visual.value} {...shared} />
          </div>
        </figure>
      ))}
    </div>
  )
}

export function BreakdownVisual({ view, items, unit, empty, measure, ordered, selected, onSelect }) {
  // The two views that run along an axis take the values in their own order -
  // chronological for a batch - rather than ranked by size. A month is a
  // position, and re-ordering months by how many people came through them is
  // not a chart of anything.
  const sequence = ordered
    ? [...items].sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')))
    : items

  const shared = { items, measure, selected, onSelect, emptyMessage: empty }

  if (view === 'bars') return <CategoryBars {...shared} />
  if (view === 'columns') return <ColumnChart {...shared} items={sequence} ordered={ordered} />
  if (view === 'treemap') return <TreemapChart {...shared} />
  if (view === 'trend') return <TrendChart {...shared} items={sequence} />
  return <DonutChart {...shared} centerLabel={unit} />
}
