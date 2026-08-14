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
// Entries with a count of zero. Deliberately not a palette hue: there is no arc
// on the ring for the dot to point at, and giving it one would promise a slice
// that isn't there.
const EMPTY_COLOR = '#cbd5e1'

const SIZE = 200
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// A gap of surface between arcs rather than a stroke around each one - a
// border would read as part of the mark.
const GAP = 3

// Empty entries are legend-only, and are held out of the fold entirely rather
// than sorted to the back of it. A zero-length arc cannot be drawn, so letting
// one take a slice slot would spend it on nothing - and a category list with
// several empties would push real slices into "Other" to make room for
// categories that aren't there.
//
// They keep their place at the end of the returned list so the legend can print
// them, and the caller's total is unaffected because they add zero to it.
function foldToSlices(items, valueKey = 'count') {
  const sorted = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const filled = sorted.filter((item) => item[valueKey] > 0)
  const empty = sorted
    .filter((item) => item[valueKey] <= 0)
    .map((item) => ({ ...item, color: EMPTY_COLOR }))

  if (filled.length <= MAX_SLICES) {
    return [...filled.map((item, index) => ({ ...item, color: item.color ?? SLICE_COLORS[index] })), ...empty]
  }
  const head = filled.slice(0, MAX_SLICES - 1).map((item, index) => ({ ...item, color: SLICE_COLORS[index] }))
  const tail = filled.slice(MAX_SLICES - 1)
  return [
    ...head,
    {
      value: `Other (${tail.length})`,
      [valueKey]: tail.reduce((sum, item) => sum + item[valueKey], 0),
      color: OTHER_COLOR,
    },
    ...empty,
  ]
}

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
  //
  // Counted rather than taken from slices.length, which now includes the empty
  // entries: one real category alongside five empty ones is still a full ring
  // and must not have a gap cut out of it.
  const filledCount = slices.filter((slice) => slice[valueKey] > 0).length
  let offset = 0
  const arcs = slices.map((slice) => {
    const length = (slice[valueKey] / total) * CIRCUMFERENCE
    // A single full-circle slice has no neighbour to be separated from, and
    // taking a gap out of it leaves a nick in an otherwise unbroken ring.
    const drawn = filledCount === 1 ? length : Math.max(length - GAP, 0.5)
    // An empty entry contributes no arc and no offset. Left to the Math.max
    // floor above it would paint a half-pixel tick on the ring for a category
    // holding nobody.
    const arc = { slice, dash: `${drawn} ${CIRCUMFERENCE - drawn}`, offset, empty: slice[valueKey] <= 0 }
    offset += length
    return arc
  })

  return (
    // Two equal halves across the full panel: the ring centred in one, the
    // legend starting at the head of the other.
    //
    // A grid rather than a flex row, because the halves have to stay equal.
    // Flexed, the legend's max-width leaves slack that the ring's half then
    // absorbs, and the ring drifts off toward the middle as the panel widens.
    // Halving it is also what keeps the legend readable - stretched to fill,
    // its label and its number sit at opposite ends of a 700px row with a
    // chasm between them.
    <div
      className="flex w-full flex-col items-center gap-6 sm:grid sm:grid-cols-2 sm:items-center sm:gap-8"
      onMouseLeave={() => setActive(null)}
    >
      <div className="relative flex w-full justify-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* -90deg so the first slice starts at twelve o'clock, which is where
              a reader expects a donut to begin. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ slice, dash, offset: arcOffset, empty }, index) => {
              if (empty) return null
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
                    // Constant width. Hover changes colour only - a slice that
                    // grows makes the ring's proportions wrong for as long as
                    // the pointer is on it, and proportion is the one thing
                    // this chart exists to show.
                    strokeWidth={STROKE}
                    strokeDasharray={dash}
                    strokeDashoffset={-arcOffset}
                    opacity={dimmed ? 0.3 : 1}
                    className="transition-opacity duration-150"
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
        {/* Pinned to the centre at a fixed width rather than filling the box:
            the box is now a half-panel wide, so inset-0 would spread a long
            slice name straight out through the ring. w-32 sits inside the
            148px hole. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
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
      <ul className="w-full min-w-0 max-w-md space-y-0.5">
        {slices.map((slice, index) => {
          const isActive = active === index
          const isEmpty = slice[valueKey] <= 0
          const row = (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden="true"
              />
              <span
                className={`min-w-0 flex-1 truncate ${isEmpty ? 'text-slate-400' : 'text-slate-700'}`}
                title={slice.value}
              >
                {slice.value}
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${isEmpty ? 'text-slate-400' : 'text-slate-900'}`}
              >
                {slice[valueKey]}
              </span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {share(slice[valueKey])}%
              </span>
            </>
          )

          return (
            <li key={slice.value}>
              {/* An empty entry is printed, not offered. Hovering it would dim
                  the whole ring to highlight a slice that isn't drawn, so it
                  is a plain row - and muted, so the eye reads the categories
                  that have people in them first. */}
              {isEmpty ? (
                <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm">
                  {row}
                </div>
              ) : (
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
                    isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                  } ${active !== null && !isActive ? 'opacity-50' : ''}`}
                >
                  {row}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
