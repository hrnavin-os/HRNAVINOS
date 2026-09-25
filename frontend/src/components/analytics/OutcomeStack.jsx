import { useState } from 'react'

// Status colours, not category colours: these three mean the same thing on
// every value, so they are the one place on the canvas colour isn't identity.
// Green and red clear the colour-blind separation check (deutan ΔE 8.6); the
// middle is a neutral grey on purpose - "still in the pipeline" is no outcome
// yet, not a third kind of outcome - and never relies on colour alone: the
// legend names all three and every segment says what it is on hover.
const GOOD = '#059669'
const OPEN = '#94a3b8'
const BAD = '#dc2626'

/**
 * Where each value's people ended up: a 100% bar split into the good outcome,
 * the ones still open, and the ones lost.
 *
 * The ring counts heads and the rate bars give one number per value; this is
 * the whole story of a value in one bar. A course with a middling confirmed
 * rate and almost no quits is still working its pipeline; the same rate with a
 * long red end is losing people, and only this view tells the two apart.
 *
 * Every bar is the full width because each is a whole of its own - the
 * question is the mix, and the headcount rides beside it as a number so a
 * three-person value isn't read as confidently as a forty-person one.
 */
export function OutcomeStack({ items, outcomes, emptyMessage = 'Nothing to show yet.', selected, onSelect }) {
  const [hovered, setHovered] = useState(null)
  const [good, bad] = outcomes

  const rows = items
    .filter((item) => item.count > 0)
    .map((item) => {
      const won = item[good.key] ?? 0
      const lost = item[bad.key] ?? 0
      return {
        ...item,
        segments: [
          { key: 'good', label: good.label, value: won, color: GOOD },
          { key: 'open', label: 'Still in the pipeline', value: Math.max(item.count - won - lost, 0), color: OPEN },
          { key: 'bad', label: bad.label, value: lost, color: BAD },
        ],
      }
    })
    .sort((a, b) => b.count - a.count)

  if (!rows.length) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  const active = hovered ?? selected
  const pct = (part, whole) => `${Math.round((part / whole) * 100)}%`

  return (
    <div className="mx-auto w-full max-w-184">
      {/* Always shown: three meanings, and colour is never the only one. */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-slate-600">
        {rows[0].segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            {segment.label}
          </span>
        ))}
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {rows.map((row) => {
          const dimmed = active && active !== row.value
          return (
            <li key={row.value}>
              <button
                type="button"
                aria-pressed={selected === row.value}
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
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                    <span className="truncate font-medium text-slate-800">{row.value}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-emerald-700">{pct(row.segments[0].value, row.count)}</span>
                    <span className="mx-1 text-slate-300">·</span>
                    <span className="font-semibold text-red-700">{pct(row.segments[2].value, row.count)}</span>
                    <span className="ml-1.5 text-slate-400">of {row.count}</span>
                  </span>
                </span>
                {/* A 2px gap of the surface between segments, so neighbouring
                    fills never run together. */}
                <span className="mt-1 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                  {row.segments
                    .filter((segment) => segment.value > 0)
                    .map((segment) => (
                      <span
                        key={segment.key}
                        title={`${row.value} · ${segment.label}: ${segment.value} (${pct(segment.value, row.count)})`}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${(segment.value / row.count) * 100}%`, backgroundColor: segment.color }}
                      />
                    ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
