import { ChartBar, ChartColumn, ChartLine, ChartPie, LayoutGrid } from 'lucide-react'
import { DonutChart } from '@/components/analytics/DonutChart'
import { CategoryBars } from '@/components/analytics/CategoryBars'
import { ColumnChart } from '@/components/analytics/ColumnChart'
import { TrendChart } from '@/components/analytics/TrendChart'
import { TreemapChart } from '@/components/analytics/TreemapChart'

/**
 * One breakdown, drawn whichever way the reader asked for.
 *
 * Five visuals over one set of numbers, because they answer five different
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
 * The trend is offered only where the values sit on an axis. A line drawn
 * across categories asserts that the gap between two of them means something,
 * and between "Data Science" and "Full Stack" it means nothing - so on those
 * dimensions the view isn't in the picker rather than being in it and lying.
 *
 * Every visual takes the same selection, so a value picked in one is still
 * picked when you switch to another. That is what makes these views of one
 * board rather than five separate charts.
 */
export const VISUALS = [
  { value: 'donut', label: 'Donut', icon: ChartPie },
  { value: 'bars', label: 'Bars', icon: ChartBar },
  { value: 'columns', label: 'Columns', icon: ChartColumn },
  { value: 'treemap', label: 'Treemap', icon: LayoutGrid },
  // See above: temporal dimensions only.
  { value: 'trend', label: 'Trend', icon: ChartLine, orderedOnly: true },
]

export function visualsFor(dimension) {
  return VISUALS.filter((visual) => !visual.orderedOnly || dimension.ordered)
}

/**
 * The visual picker: an icon per view, the way a charting tool offers them.
 *
 * Icons with their names underneath at the wider sizes and icon-only below,
 * because five labelled buttons in a panel header is a second toolbar - and
 * the shape of a chart is the one thing an icon says faster than a word.
 */
export function VisualPicker({ visuals, value, onChange }) {
  return (
    <div role="group" aria-label="Choose a chart type" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
      {visuals.map((visual) => {
        const isActive = value === visual.value
        return (
          <button
            key={visual.value}
            type="button"
            onClick={() => onChange(visual.value)}
            aria-pressed={isActive}
            title={visual.label}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <visual.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden sm:inline">{visual.label}</span>
          </button>
        )
      })}
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
