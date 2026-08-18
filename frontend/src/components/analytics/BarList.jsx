import { useState } from 'react'
import { MUTED } from '@/constants/analyticsPalette'

/**
 * A ranked list of one measure: how many candidates per source, per person,
 * per category.
 *
 * Bars rather than a second ring: arcs cannot be compared past about six
 * slices, and a list of labelled bars stays readable at twenty. Rank, label,
 * bar, count and share sit in fixed columns so the numbers line up down the
 * list instead of drifting with the length of each name.
 *
 * A bar wears the colour its slice has on the ring beside it - the same entity
 * in the same colour in both views, which is what lets a reader carry one
 * across to the other. Colour follows the entity, never its rank: a filter
 * that changes the order must not repaint the survivors, so anything the ring
 * folded away or has never seen gets the neutral instead of borrowing a hue
 * from whoever it displaced.
 *
 * items: [{ value, count, moved, quit, ... }] - the shape every breakdown here
 * returns. `metric` picks which field the bar draws.
 */
export function BarList({
  items,
  metric = 'count',
  limit = 7,
  emptyLabel = 'Not set',
  // value -> hex, from the ring beside this list.
  colors,
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
    <div>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="w-8 pb-2" />
            <th className="pb-2 text-left font-semibold">Value</th>
            <th className="w-14 pb-2 pr-2 text-right font-semibold">Count</th>
            <th className="w-20 pb-2 text-right font-semibold">% of total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const lit = isSelected ? isSelected(row) : true
            const color = row.value === emptyLabel ? MUTED : colors?.get(row.value) ?? MUTED
            return (
              <tr
                key={row.value}
                // Dimmed rather than dropped when something else is selected:
                // a list that removes its other rows loses the comparison the
                // selection was made against.
                className={`group transition-opacity ${lit ? '' : 'opacity-35'} ${
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
                tabIndex={onSelect ? 0 : undefined}
              >
                {/* The rank, said out loud. The order is already the ranking,
                    but "third" is a fact people quote, and counting rows to
                    find it is work the list can do for them. */}
                <td className="py-2 pr-2 align-top text-xs font-semibold tabular-nums text-slate-300">
                  {index + 1}
                </td>
                <td className="py-2 pr-3 align-top">
                  <span className="block truncate font-medium text-slate-700" title={row.value}>
                    {row.value}
                  </span>
                  {/* The bar under the label rather than in its own column:
                      given a column it would be as narrow as the longest name
                      allowed, and a bar too short to compare is decoration. */}
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${Math.max((row[metric] / peak) * 100, row[metric] ? 2 : 0)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </span>
                </td>
                <td className="py-2 pr-2 align-top text-right font-semibold tabular-nums text-slate-900">
                  {row[metric]}
                </td>
                <td className="py-2 align-top text-right text-xs tabular-nums text-slate-400">
                  {total ? Math.round((row[metric] / total) * 1000) / 10 : 0}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {hovered && <Tooltip row={rows.find((row) => row.value === hovered)} />}

      {/* Named rather than silently cut: a list that stops at seven without
          saying so reads as the whole answer. */}
      {(drawn.length > limit || untouched > 0) && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
          {drawn.length > limit && `${drawn.length - limit} more not shown`}
          {drawn.length > limit && untouched > 0 && ' · '}
          {untouched > 0 && `${untouched} with nobody in ${untouched === 1 ? 'it' : 'them'} yet`}
          {' · all of them are in the table below'}
        </p>
      )}
    </div>
  )
}

// What the bar can't say: of these, how many crossed to Foundation, how many
// walked, how many nobody has called yet. Anchored under the list rather than
// floating at the pointer, so it never covers the row above the one being
// read.
function Tooltip({ row }) {
  if (!row || row.moved === undefined) return null
  return (
    <dl className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
      <span className="font-semibold text-slate-900">{row.value}</span>
      <Line label="Moved" value={row.moved} />
      <Line label="Quit" value={row.quit} />
      {row.uncalled !== undefined && <Line label="Not called" value={row.uncalled} />}
    </dl>
  )
}

function Line({ label, value }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
    </span>
  )
}
