import { useState } from 'react'
import { BAR, MUTED } from '@/constants/analyticsPalette'

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
 * One hue for every column, not a palette. Colour would encode identity, which
 * every column already carries as its own label underneath - and re-colouring
 * on every filter change (the order moves, so the colours would too) makes a
 * board look like it changed its mind. Height carries the number; colour
 * carries the highlight, and nothing else.
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
  const share = (value) => Math.round((value / total) * 1000) / 10
  const active = hovered ?? (selected ? rows.findIndex((row) => row.value === selected) : -1)

  return (
    // Horizontally scrollable, because the whole point of this view is that
    // nothing is folded away - twenty columns squeezed into the panel width
    // would be a barcode. The plot keeps a floor of 3rem a column and scrolls
    // past that.
    <div className="w-full overflow-x-auto" onMouseLeave={() => setHovered(null)}>
      <div className="flex min-w-full items-end gap-2 px-1" style={{ height: '15rem' }}>
        {rows.map((row, index) => {
          const value = row[valueKey]
          const isEmpty = value <= 0
          const isActive = active === index
          const dimmed = active >= 0 && !isActive
          // A hairline stub rather than nothing at all for an empty value: the
          // month still has to read as a month that nobody came through, not
          // as a place where the chart failed to draw.
          const height = isEmpty ? 2 : Math.max((value / tallest) * 100, 2)

          return (
            <div
              key={row.value}
              className={`flex min-w-12 flex-1 flex-col items-center gap-1 rounded-md pt-1 transition-opacity ${
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
              {/* The figure rides above its own column rather than in a
                  tooltip: on a board somebody is reading numbers off, a value
                  you have to hover to see is a value nobody quotes. */}
              <span
                className={`text-[11px] font-bold tabular-nums ${isEmpty ? 'text-slate-300' : 'text-slate-700'}`}
              >
                {measure === 'share' ? `${share(value)}%` : value}
              </span>
              {/* The track fills the leftover height so every column sits on
                  the same baseline and the tops are comparable by eye. */}
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t transition-all duration-200"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isEmpty ? MUTED : row.color ?? BAR,
                    opacity: isEmpty ? 0.35 : 1,
                  }}
                />
              </div>
              <span
                className="w-full truncate pt-1 text-center text-[10px] font-medium text-slate-500"
                title={row.period ? `${row.value} · ${row.period}` : row.value}
              >
                {row.value}
              </span>
              {/* Batches are named by number, which says nothing to anyone who
                  wasn't there - so the month rides underneath. */}
              {row.period && (
                <span className="w-full truncate text-center text-[9px] text-slate-400">{row.period}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
