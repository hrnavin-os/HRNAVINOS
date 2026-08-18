import { useState } from 'react'
import { BAR, MUTED } from '@/constants/analyticsPalette'

/**
 * A ranked list of one measure: how many candidates per source, per person,
 * per category.
 *
 * Bars rather than a donut once a breakdown runs past a handful of values -
 * arcs can't be compared past six slices, and a list of labelled bars stays
 * readable at twenty. One hue throughout, because the bar's length already
 * carries the number and colouring by rank would repaint every bar the moment
 * a filter changed the order.
 *
 * items: [{ value, count, moved, quit, uncalled }] - the shape every breakdown
 * on this dashboard returns. `metric` picks which of them the bar draws.
 */
export function BarList({
  items,
  metric = 'count',
  color = BAR,
  limit = 8,
  emptyLabel = 'Not set',
  // Off for a scale that already has an order of its own - a set of buckets
  // running oldest to newest would turn into a ranking that reads backwards.
  sorted = true,
  // Cross-highlighting. `isSelected(row)` decides which bars stay lit, so the
  // page can answer it however it likes - on the remarks tab a picked outcome
  // lights every remark inside it, not just the one with a matching name.
  isSelected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)
  const ordered = sorted ? [...items].sort((a, b) => b[metric] - a[metric]) : items
  // A bar of zero draws nothing, so a run of them at the foot of a ranking is
  // a column of labels against an empty track - height spent saying "no". They
  // are counted in a line underneath instead, and the table below the canvas
  // still lists them by name.
  const drawn = sorted ? ordered.filter((row) => row[metric] > 0) : ordered
  const untouched = ordered.length - drawn.length
  const rows = drawn.slice(0, limit)
  // Scaled to the biggest bar, not to the total: at a 40/5/3 split, scaling to
  // the total leaves every bar but the first a sliver against an empty track.
  const peak = Math.max(...rows.map((row) => row[metric]), 1)
  const total = items.reduce((sum, row) => sum + row[metric], 0)

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const isEmptyValue = row.value === emptyLabel
        const lit = isSelected ? isSelected(row) : true
        return (
          <li
            key={row.value}
            // Dimmed rather than dropped when something else is selected: a
            // list that removes its other rows loses the comparison the
            // selection was made against.
            className={`relative transition-opacity ${lit ? '' : 'opacity-35'} ${
              onSelect ? 'cursor-pointer' : ''
            }`}
            onMouseEnter={() => setHovered(row.value)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(row.value)}
            onBlur={() => setHovered(null)}
            onClick={() => onSelect?.(row.value)}
            onKeyDown={(event) => {
              if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                onSelect(row.value)
              }
            }}
            tabIndex={0}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-slate-700" title={row.value}>
                {row.value}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {row[metric]}
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  {total ? `${Math.round((row[metric] / total) * 100)}%` : '0%'}
                </span>
              </span>
            </div>
            {/* A recessive track behind the bar, so a small value still shows
                where the scale ends rather than floating in white space. */}
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.max((row[metric] / peak) * 100, row[metric] ? 2 : 0)}%`,
                  // "Not set" is the absence of a value, not one more of the
                  // things being compared, so it never wears the series hue.
                  backgroundColor: isEmptyValue ? MUTED : color,
                }}
              />
            </div>
            {hovered === row.value && <Tooltip row={row} />}
          </li>
        )
      })}
      {/* Named rather than silently cut: a list that stops at ten without
          saying so reads as the whole answer. */}
      {drawn.length > limit && (
        <li className="pt-1 text-xs text-slate-400">+ {drawn.length - limit} more, in the table below</li>
      )}
      {untouched > 0 && (
        <li className="pt-1 text-xs text-slate-400">
          {untouched} with nobody in {untouched === 1 ? 'it' : 'them'} yet
        </li>
      )}
    </ul>
  )
}

// What the bar can't say: of these, how many crossed to Foundation, how many
// walked, how many nobody has called yet.
function Tooltip({ row }) {
  return (
    <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <p className="mb-1.5 truncate font-semibold text-slate-900">{row.value}</p>
      <dl className="space-y-1">
        <Line label="Candidates" value={row.count} />
        {row.moved !== undefined && <Line label="Moved to Foundation" value={row.moved} />}
        {row.quit !== undefined && <Line label="Quit" value={row.quit} />}
        {row.uncalled !== undefined && <Line label="Not called yet" value={row.uncalled} />}
      </dl>
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  )
}
