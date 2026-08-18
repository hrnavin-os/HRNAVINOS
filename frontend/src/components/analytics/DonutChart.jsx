import { useState } from 'react'
import { Pin } from 'lucide-react'

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
export function foldToSlices(items, valueKey = 'count') {
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

export function DonutChart({
  items,
  valueKey = 'count',
  centerLabel = 'Total',
  emptyMessage = 'Nothing to show yet.',
  // 'count' or 'share' - which of the two columns the legend leads with.
  // Both are always printed; this only decides which one is the figure.
  measure = 'count',
  // Optional: hand the pin to the page, so a slice picked here highlights the
  // same value in the bars and the table beside it. Left out, the chart keeps
  // its own pin and behaves exactly as it always has.
  selected,
  onSelect,
}) {
  // Two sources for one highlight. Hover is the transient one and wins while
  // the pointer is over the chart; a pin survives the pointer leaving, which is
  // the whole point of it - you can pin a slice and then read its figures, or
  // point at the panel while talking about it, without the readout snapping
  // back to the total the moment you move away.
  const [hovered, setHovered] = useState(null)
  const [ownPin, setOwnPin] = useState(null)

  const slices = foldToSlices(items, valueKey)
  const total = slices.reduce((sum, item) => sum + item[valueKey], 0)

  const controlled = typeof onSelect === 'function'
  const pinnedIndex = controlled ? slices.findIndex((slice) => slice.value === selected) : ownPin
  const pinned = pinnedIndex >= 0 ? pinnedIndex : null
  const active = hovered ?? pinned

  if (!total) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  // One decimal, and none when it lands on a whole number: 35.7% and 14.3%
  // are different sizes of slice, and a legend that rounded both to 36% and
  // 14% would say two equal slices were unequal and two unequal ones equal.
  const byShare = measure === 'share'
  const share = (value) => Math.round((value / total) * 1000) / 10
  const activeSlice = active === null ? null : slices[active]
  // Clicking the pinned slice again releases it, so the same gesture that turns
  // the pin on turns it off and there is no separate control to find.
  const togglePin = (index) => {
    if (!controlled) {
      setOwnPin((current) => (current === index ? null : index))
      return
    }
    const value = slices[index]?.value
    // "Other (3)" is several values folded into one arc, so there is nothing
    // for the other views to highlight - clicking it clears instead.
    const foldable = value === selected || value?.startsWith('Other (')
    onSelect(foldable ? null : value)
  }

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
    // Ring and legend centred as one group. They used to be two fixed halves of
    // the panel, which left the ring pinned against the left edge and a field
    // of white to the right of the legend - the panel is far wider than the
    // pair needs, and splitting it just decided where the emptiness went.
    // Centred, the whitespace falls evenly on both sides and the two read as
    // one object.
    <div
      // min-w-0 is load-bearing: a grid or flex item defaults to min-width
      // auto, so the ring's fixed 200px plus a legend sized to its longest
      // label would push this whole panel wider than the column it sits in and
      // spill the card's own header off the right edge.
      className="flex w-full min-w-0 flex-col items-center justify-center gap-8 sm:flex-row sm:items-center lg:gap-10"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="relative shrink-0">
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
                    aria-pressed={pinned === index}
                    aria-label={`${slice.value}: ${slice[valueKey]}, ${share(slice[valueKey])}%`}
                    // pointer-events: stroke explicitly. The default,
                    // visiblePainted, only hit-tests where paint actually
                    // lands, and browsers disagree about whether a fully
                    // transparent stroke counts - which would leave these
                    // catching nothing.
                    style={{ pointerEvents: 'stroke' }}
                    // No focus ring: focusing a slice dims its neighbours and
                    // swaps the centre readout to its value, which is a
                    // stronger and better-placed indication than an outline
                    // traced around a dashed arc.
                    className="cursor-pointer outline-none"
                    onMouseEnter={() => setHovered(index)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                    onClick={() => togglePin(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        togglePin(index)
                      }
                    }}
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
        {/* Centred at a fixed width rather than filling the box, which is as
            wide as the ring: w-32 sits inside the 148px hole, so a long slice
            name wraps in the middle instead of spilling out through the arc. */}
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
          {/* Says the readout will stay put after the pointer leaves. Without
              it a pin is invisible until you move away and notice the centre
              didn't reset, which is a thing to discover rather than be told. */}
          {pinned !== null && hovered === null && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              <Pin className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
              Pinned
            </span>
          )}
        </div>
      </div>

      {/* The legend is not optional here: a slice's identity is otherwise
          carried by colour alone. Each row repeats the count and the share, so
          two equal slices are still distinguishable - and hovering a row lights
          its slice, which is the only way to tell equal slices apart on the
          ring itself.

          A real table, and not for markup's sake: auto table layout sizes each
          column to its own content, so the count lands immediately after the
          longest name and every row's numbers line up underneath. A flex or
          grid row cannot do both at once - a track that stretches to align the
          numbers is a track that pushes them to the far edge, which is what
          left a hand's width of nothing between a short name and its count.

          One column, however many entries there are. Two columns were tried
          and were worse in every way that mattered: each had to truncate its
          labels to fit beside the ring, the rank order had to be read down one
          column and back up the other, and the second column was usually the
          all-grey empty ones, which read as something having gone wrong. A
          taller list is simply a taller list. */}
      <div className="flex min-w-0 justify-center">
        <table className="w-auto max-w-full border-separate border-spacing-0 text-sm">
          {/* Headed, because two columns of bare numbers beside a list of
              names is a table asking to be misread - the count and the share
              are not obviously which from the figures alone. */}
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="pb-2" />
              <th className="pb-2" />
              <th className="pb-2 pr-3 text-right font-semibold">Count</th>
              <th className="pb-2 pr-2 text-right font-semibold">% of total</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice, index) => {
              const isActive = active === index
              const isPinned = pinned === index
              const isEmpty = slice[valueKey] <= 0
              // The background lives on the cells, not the row: a <tr> takes
              // a colour but will not clip a radius, so the rounded ends have
              // to come from the first and last cell.
              const cell = `py-1.5 transition-colors first:rounded-l-md last:rounded-r-md ${
                isActive ? 'bg-slate-100' : isEmpty ? '' : 'group-hover:bg-slate-50'
              } ${active !== null && !isActive ? 'opacity-40' : ''}`

              return (
                // An empty entry is printed, not offered: hovering it would
                // dim the whole ring to highlight a slice that isn't drawn.
                // So no handlers, no tab stop, and muted text - the eye
                // should reach the categories with people in them first.
                <tr
                  key={slice.value}
                  className={`group ${isEmpty ? '' : 'cursor-pointer outline-none'}`}
                  {...(isEmpty
                    ? {}
                    : {
                        tabIndex: 0,
                        // aria-pressed is only meaningful on a button, so the
                        // role has to come with it. Same trade the shared
                        // DataTable makes for clickable rows: the control
                        // semantics matter more here than the row ones.
                        role: 'button',
                        'aria-pressed': isPinned,
                        onMouseEnter: () => setHovered(index),
                        onFocus: () => setHovered(index),
                        onBlur: () => setHovered(null),
                        onClick: () => togglePin(index),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            togglePin(index)
                          }
                        },
                      })}
                >
                  <td className={`${cell} pl-2 pr-2.5`}>
                    {/* The pinned row's swatch grows a halo, so which slice
                        is held is legible from the legend and not only from
                        the badge in the middle of the ring. */}
                    <span
                      className={`block h-2.5 w-2.5 rounded-full transition-shadow ${
                        isPinned ? 'ring-2 ring-slate-300 ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                  </td>
                  <td className={`${cell} pr-5`}>
                    {/* The truncation floor. Without it the table grows to
                        whatever the longest category is called and pushes
                        the numbers off the panel. */}
                    <span
                      className={`block max-w-80 truncate ${
                        isEmpty ? 'text-slate-400' : 'text-slate-700'
                      }`}
                      title={slice.value}
                    >
                      {slice.value}
                    </span>
                  </td>
                  {/* Whichever measure the panel is set to reads as the
                      figure; the other stays beside it, smaller, so
                      switching never costs you the number you were not
                      looking at. */}
                  <td
                    className={`${cell} pr-3 text-right tabular-nums ${
                      byShare ? 'text-xs text-slate-400' : 'font-semibold'
                    } ${isEmpty || byShare ? 'text-slate-400' : 'text-slate-900'}`}
                  >
                    {slice[valueKey]}
                  </td>
                  <td
                    className={`${cell} pr-2 text-right tabular-nums ${
                      byShare ? 'font-semibold' : 'text-xs text-slate-400'
                    } ${isEmpty || !byShare ? 'text-slate-400' : 'text-slate-900'}`}
                  >
                    {share(slice[valueKey])}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
