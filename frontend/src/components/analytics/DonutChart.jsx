import { useState } from 'react'

// Part-to-whole for one breakdown: how the candidates divide across categories
// or call outcomes.
//
// A donut rather than a pie, so the total can live in the hole - it is the
// number the page used to lead with, and putting it at the centre of the thing
// it is the total of says more than a separate tile did.
//
// Slices are capped. Past six the arcs get too thin to tell apart and adjacent
// hues start to blur, so the tail folds into one "Other" slice rather than the
// palette being extended - a seventh generated hue is indistinguishable from an
// existing one under colour-blindness.
const MAX_SLICES = 6

// Fixed slot order, assigned by position and never cycled. Validated as a
// categorical palette against a white surface: worst adjacent CVD deltaE 11.3
// (target >= 8), worst normal-vision 20.9, every slot at least 3:1 against the
// surface. Re-run the validator before reordering - the order IS the
// colour-blind-safety mechanism, not decoration.
const SLICE_COLORS = ['#2563eb', '#ea580c', '#0d9488', '#7c3aed', '#db2777', '#65a30d']
const OTHER_COLOR = '#94a3b8'

const SIZE = 200
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// A gap of surface between arcs rather than a stroke around each one - a
// border would read as part of the mark.
const GAP = 3

function foldToSlices(items, valueKey = 'count') {
  const sorted = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  if (sorted.length <= MAX_SLICES) {
    return sorted.map((item, index) => ({ ...item, color: item.color ?? SLICE_COLORS[index] }))
  }
  const head = sorted.slice(0, MAX_SLICES - 1).map((item, index) => ({ ...item, color: SLICE_COLORS[index] }))
  const tail = sorted.slice(MAX_SLICES - 1)
  return [
    ...head,
    {
      value: `Other (${tail.length})`,
      [valueKey]: tail.reduce((sum, item) => sum + item[valueKey], 0),
      color: OTHER_COLOR,
    },
  ]
}

// How far the active arc thickens. The lift is what tells the reader the mark
// responded to them, rather than only the legend changing somewhere else.
const LIFT = 5
// A transparent arc drawn over each slice, wider than the paint, so a thin
// segment is still catchable - hovering a 3px arc dead-centre is a pinpoint
// nobody hits.
const HIT_STROKE = STROKE + 16

export function DonutChart({ items, valueKey = 'count', centerLabel = 'Total', emptyMessage = 'Nothing to show yet.' }) {
  const [active, setActive] = useState(null)
  const slices = foldToSlices(items, valueKey)
  const total = slices.reduce((sum, item) => sum + item[valueKey], 0)

  if (!total) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  const share = (value) => Math.round((value / total) * 100)
  const activeSlice = active === null ? null : slices[active]

  // Geometry once, so the arcs and their hit areas can't drift apart.
  let offset = 0
  const arcs = slices.map((slice) => {
    const length = (slice[valueKey] / total) * CIRCUMFERENCE
    // A single full-circle slice has no neighbour to be separated from, and
    // taking a gap out of it leaves a nick in an otherwise unbroken ring.
    const drawn = slices.length === 1 ? length : Math.max(length - GAP, 0.5)
    const arc = { slice, dash: `${drawn} ${CIRCUMFERENCE - drawn}`, offset }
    offset += length
    return arc
  })

  return (
    <div
      className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8"
      onMouseLeave={() => setActive(null)}
    >
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* -90deg so the first slice starts at twelve o'clock, which is where
              a reader expects a donut to begin. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ slice, dash, offset: arcOffset }, index) => {
              const isActive = active === index
              const dimmed = active !== null && !isActive
              return (
                <g key={slice.value}>
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={isActive ? STROKE + LIFT : STROKE}
                    strokeDasharray={dash}
                    strokeDashoffset={-arcOffset}
                    opacity={dimmed ? 0.35 : 1}
                    className="transition-all duration-150"
                  />
                  {/* Focusable, so the keyboard gets what the pointer gets.
                      aria-label carries the same reading the centre shows. */}
                  <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={HIT_STROKE}
                    strokeDasharray={dash}
                    strokeDashoffset={-arcOffset}
                    tabIndex={0}
                    role="button"
                    aria-label={`${slice.value}: ${slice[valueKey]}, ${share(slice[valueKey])}%`}
                    // pointer-events: stroke explicitly. The default,
                    // visiblePainted, only hit-tests where paint actually
                    // lands, and browsers disagree about whether a fully
                    // transparent stroke counts - which would leave these
                    // catching nothing.
                    style={{ pointerEvents: 'stroke' }}
                    // No focus ring: focusing a slice thickens it and swaps
                    // the centre readout to its value, which is a stronger
                    // and better-placed indication than an outline traced
                    // around a dashed arc.
                    className="cursor-pointer outline-none"
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              )
            })}
          </g>
        </svg>

        {/* The readout lives in the hole rather than in a floating tooltip: on
            a ring a tooltip covers the neighbouring slices it is meant to be
            compared against, and the centre is already the one place every
            slice is equidistant from. Values lead, the label follows.
            Proportional figures - equal-width digits make a large standalone
            number look loose. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <span className="text-3xl font-bold leading-none text-slate-900">
            {activeSlice ? activeSlice[valueKey] : total}
          </span>
          <span className="mt-1 line-clamp-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {activeSlice ? activeSlice.value : centerLabel}
          </span>
          {activeSlice && (
            <span className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {share(activeSlice[valueKey])}%
            </span>
          )}
        </div>
      </div>

      {/* The legend is not optional here: a slice's identity is otherwise
          carried by colour alone. Each row repeats the count and the share, so
          two equal slices are still distinguishable - and hovering a row lights
          its slice, which is the only way to tell equal slices apart on the
          ring itself. */}
      <ul className="w-full min-w-0 space-y-0.5">
        {slices.map((slice, index) => {
          const isActive = active === index
          return (
            <li key={slice.value}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
                  isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                } ${active !== null && !isActive ? 'opacity-50' : ''}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-slate-700" title={slice.value}>
                  {slice.value}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{slice[valueKey]}</span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">
                  {share(slice[valueKey])}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
