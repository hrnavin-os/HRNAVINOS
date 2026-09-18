import { useState } from 'react'
import { colorByEntity, MUTED } from '@/constants/analyticsPalette'

/**
 * The breakdown as vertical columns on a common baseline.
 *
 * The view that shows *everything*. The ring and the ranked bars both fold
 * past six values into one "Other" slice, because seven arcs cannot be told
 * apart and a seventh hue is indistinguishable from an existing one under
 * colour blindness. Neither limit applies to a column: a chart of fourteen
 * batches or eleven courses is exactly what this is for, and nothing is folded
 * away here.
 *
 * Coloured per entity, from the assignment every view on the canvas shares.
 * Alone, this chart wore one hue and that was right: a single measure across
 * many labels has nothing for colour to encode. Beside the ring and the
 * treemap it is wrong - "Career Gap" is teal a hand's width to the left, and
 * the same category in two colours two charts apart costs the reader the link
 * between them. Colour here is redundant with the label underneath, which
 * costs nothing.
 *
 * Nothing is folded away, so the values past the palette's six validated slots
 * wear the same grey the ring's "Other" arc does rather than a seventh
 * generated hue.
 *
 * `ordered` keeps the values in the order they were handed over - which for a
 * batch is chronological - rather than sorting them by size. A month is a
 * position on an axis, and re-ordering months by how many people came through
 * them is not a chart of anything.
 */
export function ColumnChart({
  items,
  valueKey = 'count',
  emptyMessage = 'Nothing to show yet.',
  measure = 'count',
  ordered = false,
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)

  const rows = ordered ? items : [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const total = rows.reduce((sum, row) => sum + row[valueKey], 0)

  if (!total) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  // Scaled against the tallest column rather than the total: this view is for
  // comparing values with each other, and against the total a board where
  // nothing exceeds a third of the whole is two-thirds empty air.
  const tallest = Math.max(...rows.map((row) => row[valueKey]))
  const colors = colorByEntity(items, valueKey)
  // The name band, sized once for the whole chart rather than per column.
  //
  // Load-bearing, not tidiness: the label sits inside the column's own box, so
  // a name that wraps to two lines takes its second line out of that column's
  // plot and out of nobody else's. The bar then stands on a baseline 12px
  // above its neighbours' and is measured against a shorter track - which is
  // the one thing this chart exists not to do. One height for every column and
  // they are all percentages of the same plot again.
  //
  // Two lines of the name, plus a third for the month where the values carry
  // one. Anything longer clamps, with the full name on the title.
  // Heights include the band's own top padding: 6px of gap over two 12.5px
  // lines of the name, and another 11.25px where a month rides underneath.
  const nameBand = rows.some((row) => row.period) ? 'h-[44px]' : 'h-[32px]'
  const share = (value) => Math.round((value / total) * 1000) / 10
  const active = hovered ?? (selected ? rows.findIndex((row) => row.value === selected) : -1)

  return (
    // Horizontally scrollable, because the whole point of this view is that
    // nothing is folded away - twenty columns squeezed into the panel width
    // would be a barcode. The plot keeps a floor of 3rem a column and scrolls
    // past that.
    <div className="w-full overflow-x-auto" onMouseLeave={() => setHovered(null)}>
      {/* items-stretch, not items-end: every column has to be as tall as the
          plot for its bar to be a percentage of anything. Sized to content,
          the track collapses and every bar comes out at zero height. */}
      <div className="flex min-w-full items-stretch justify-center gap-2 px-1" style={{ height: '16rem' }}>
        {rows.map((row, index) => {
          const value = row[valueKey]
          const isEmpty = value <= 0
          const isActive = active === index
          const dimmed = active >= 0 && !isActive
          // The tallest bar stops at 88%, leaving the top of the track for the
          // figures to sit in - at 100% the label on the tallest column would
          // have nowhere to go but outside the plot.
          //
          // A hairline stub rather than nothing at all for an empty value: the
          // month still has to read as a month that nobody came through, not
          // as a place where the chart failed to draw.
          const height = isEmpty ? 1.5 : Math.max((value / tallest) * 88, 1.5)

          return (
            <div
              key={row.value}
              // Capped as well as shared out: four values across a cell of the
              // canvas would otherwise be four slabs, which reads as a diagram
              // rather than as a chart of anything.
              className={`flex h-full min-w-12 max-w-24 flex-1 flex-col items-center rounded-md transition-opacity ${
                dimmed ? 'opacity-40' : ''
              } ${isEmpty ? '' : 'cursor-pointer'}`}
              {...(isEmpty
                ? {}
                : {
                    tabIndex: 0,
                    role: 'button',
                    'aria-pressed': row.value === selected,
                    'aria-label': `${row.value}: ${value}, ${share(value)}%`,
                    onMouseEnter: () => setHovered(index),
                    onFocus: () => setHovered(index),
                    onBlur: () => setHovered(null),
                    onClick: () => onSelect?.(row.value === selected ? null : row.value),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelect?.(row.value === selected ? null : row.value)
                      }
                    },
                  })}
            >
              {/* The track: every column's bar is a percentage of this, so all
                  of them sit on one baseline and their tops are comparable by
                  eye. Positioned rather than laid out - a percentage height
                  resolves against a positioned ancestor's used height, which
                  is the one thing a flex track cannot promise. */}
              <div className="relative w-full flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t transition-all duration-200"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isEmpty ? MUTED : colors.get(row.value),
                    opacity: isEmpty ? 0.35 : 1,
                  }}
                />
                {/* The figure rides just above its own bar rather than in a
                    tooltip: on a board somebody is reading numbers off, a
                    value you have to hover to see is a value nobody quotes. */}
                <span
                  className={`absolute inset-x-0 text-center text-[11px] font-bold tabular-nums ${
                    isEmpty ? 'text-slate-300' : 'text-slate-700'
                  }`}
                  style={{ bottom: `calc(${height}% + 3px)` }}
                >
                  {measure === 'share' ? `${share(value)}%` : value}
                </span>
              </div>
              {/* Wrapped to two lines rather than truncated: a column is
                  identified by the name under it, and "Currently Working in
                  oth..." identifies nothing. Top-aligned in the band, so a
                  one-line name and a two-line one start on the same line as
                  each other instead of hanging from the bottom. */}
              <div className={`${nameBand} w-full shrink-0 overflow-hidden pt-1.5`}>
                <span
                  className="line-clamp-2 block w-full text-center text-[10px] font-medium leading-tight text-slate-500"
                  title={row.period ? `${row.value} · ${row.period}` : row.value}
                >
                  {row.value}
                </span>
                {/* Batches are named by number, which says nothing to anyone
                    who wasn't there - so the month rides underneath. */}
                {row.period && (
                  <span className="block w-full truncate text-center text-[9px] leading-tight text-slate-400">
                    {row.period}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
