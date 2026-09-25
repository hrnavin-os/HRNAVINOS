import { useState } from 'react'

/**
 * How well each value converts, ranked - the rate, not the headcount.
 *
 * The ring beside it says which value is biggest; this says which one *works*.
 * The two disagree more often than you'd think: a small course can confirm
 * nearly everyone it takes while the biggest one leaks, and a chart of counts
 * can never show that.
 *
 * Bars run on a fixed 0-100% scale rather than against the best value, because
 * a rate has a real ceiling - scaled to the leader, a 20% best looks like a
 * full bar and reads as success. The board-wide rate is drawn as one dashed
 * marker across every track, so each bar is read against the average at a
 * glance instead of against the bar above it.
 *
 * Each rate carries its own "5 of 8" beside it. A value with two leads has a
 * rate of 0% or 50% or 100% and nothing in between; the sample size is what
 * tells a reader how much weight the bar can bear.
 */
export function RateBars({
  items,
  // The field counted as a success, and what to call it in the "5 of 8 …" line.
  numeratorKey,
  noun,
  emptyMessage = 'Nothing to show yet.',
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)

  // A value with nobody in it has no rate - not a rate of zero.
  const rows = items
    .filter((item) => item.count > 0)
    .map((item) => ({ ...item, rate: (item[numeratorKey] ?? 0) / item.count }))
    .sort((a, b) => b.rate - a.rate || b.count - a.count)

  if (!rows.length) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const hits = rows.reduce((sum, row) => sum + (row[numeratorKey] ?? 0), 0)
  const average = hits / total
  const pct = (value) => `${Math.round(value * 100)}%`
  const active = hovered ?? selected

  return (
    <div className="mx-auto w-full max-w-184">
      <div className="mb-2 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
        <span className="inline-block h-3 border-l-2 border-dashed border-slate-400" aria-hidden="true" />
        Overall {pct(average)} ({hits} of {total})
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {rows.map((row) => {
          const dimmed = active && active !== row.value
          return (
            <li key={row.value}>
              <button
                type="button"
                aria-pressed={selected === row.value}
                title={`${row.value}: ${pct(row.rate)} ${noun} (${row[numeratorKey] ?? 0} of ${row.count})`}
                onMouseEnter={() => setHovered(row.value)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(row.value)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelect?.(selected === row.value ? null : row.value)}
                className={`block w-full rounded-md px-2 py-1.5 text-left transition-opacity hover:bg-slate-50 ${
                  dimmed ? 'opacity-40' : ''
                } ${selected === row.value ? 'bg-slate-50 ring-1 ring-slate-300' : ''}`}
              >
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-slate-800">{row.value}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-slate-900">{pct(row.rate)}</span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      {row[numeratorKey] ?? 0} of {row.count}
                    </span>
                  </span>
                </span>
                <span className="relative mt-1 block h-2 rounded-full bg-slate-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${Math.max(row.rate * 100, row.rate ? 1.5 : 0)}%`, backgroundColor: row.color }}
                  />
                  {/* The board-wide rate, the same on every track. */}
                  <span
                    className="absolute -inset-y-1 border-l-2 border-dashed border-slate-400"
                    style={{ left: `${average * 100}%` }}
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
