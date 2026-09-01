import { useState } from 'react'
import { Pin } from 'lucide-react'
import { foldToSlices } from '@/components/analytics/DonutChart'

/**
 * The same breakdown as the donut, drawn as a ranked bar chart.
 *
 * Two views of one set of numbers because they answer different questions. A
 * ring answers "how does this divide up" - it is the shape of the whole, and
 * two slices of similar size are hard to order but easy to see as roughly
 * equal. Bars answer "which is biggest, and by how much" - a common baseline
 * is the only encoding people read small differences off accurately, which is
 * exactly what a ring is worst at.
 *
 * Colour comes from foldToSlices, so a category is the same colour in both
 * views and switching between them doesn't repaint anything. The fold to
 * "Other" comes with it - at seven-plus categories the ring cannot show them
 * apart, and a bar list that showed more than the ring would make the toggle a
 * change of data rather than a change of view.
 *
 * No legend: every bar is labelled with its own name, so identity is never
 * carried by colour alone and a legend box would only repeat the labels.
 */
export function CategoryBars({
  items,
  valueKey = 'count',
  emptyMessage = 'Nothing to show yet.',
  // 'count' or 'share' - which figure leads at the end of the bar. Both are
  // always printed, same as the donut's legend.
  measure = 'count',
  // Shared with the donut, so a category pinned in one view is still pinned
  // when you switch to the other.
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)

  const rows = foldToSlices(items, valueKey)
  const total = rows.reduce((sum, row) => sum + row[valueKey], 0)

  if (!total) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  // Bars are scaled against the largest category, not the total. Against the
  // total, a board where nothing exceeds a third of the whole is three-quarters
  // empty track and every bar is a stub - the ring is already the view that
  // shows shares of the whole, and this one exists to compare categories with
  // each other.
  const largest = Math.max(...rows.map((row) => row[valueKey]))
  const share = (value) => Math.round((value / total) * 1000) / 10

  const pinnedIndex = rows.findIndex((row) => row.value === selected)
  const pinned = pinnedIndex >= 0 ? pinnedIndex : null
  const active = hovered ?? pinned

  const togglePin = (index) => {
    const value = rows[index]?.value
    // "Other (3)" is several categories in one bar, so there is nothing for the
    // other views to highlight - clicking it clears instead.
    onSelect?.(value === selected || value?.startsWith('Other (') ? null : value)
  }

  return (
    // Capped and centred. The panel runs the full width of the board, and a
    // bar stretched across 1400px is a rule, not a mark - the eye can't hold
    // the left end and the right end at once, and the figures end up an inch
    // of white away from the name they belong to. 46rem is wide enough for the
    // longest category name to sit above its bar unwrapped.
    <div className="mx-auto w-full min-w-0 max-w-184" onMouseLeave={() => setHovered(null)}>
      <div className="mb-2 flex items-center justify-end gap-4 pr-6 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="w-10 text-right">Count</span>
        <span className="w-16 text-right">% of total</span>
      </div>

      <ul className="space-y-1">
        {rows.map((row, index) => {
          const value = row[valueKey]
          const isEmpty = value <= 0
          const isActive = active === index
          const isPinned = pinned === index
          // A hairline stub for an empty category rather than nothing at all:
          // the row still has to read as a bar that happens to be at zero,
          // not as a row where the chart failed to draw.
          const width = isEmpty ? 0 : Math.max((value / largest) * 100, 1.5)

          return (
            <li key={row.value}>
              <div
                className={`group flex items-center gap-3 rounded-md px-1.5 py-1 transition-colors ${
                  isActive ? 'bg-slate-100' : isEmpty ? '' : 'hover:bg-slate-50'
                } ${active !== null && !isActive ? 'opacity-40' : ''} ${
                  isEmpty ? '' : 'cursor-pointer outline-none'
                }`}
                {...(isEmpty
                  ? {}
                  : {
                      tabIndex: 0,
                      role: 'button',
                      'aria-pressed': isPinned,
                      'aria-label': `${row.value}: ${value}, ${share(value)}%`,
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
                {/* The label sits above its own bar rather than in a column
                    beside it. A left-hand name column has to be as wide as the
                    longest category ("Currently Working in other field (Job
                    Switch)"), which on this panel leaves the bars a third of
                    the width to live in - and the bars are the part being
                    compared. */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`min-w-0 truncate text-sm ${
                        isEmpty ? 'text-slate-400' : 'font-medium text-slate-700'
                      }`}
                      title={row.value}
                    >
                      {row.value}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-4">
                      {/* Whichever measure is selected leads in the darker
                          ink; the other stays beside it in muted ink rather
                          than disappearing, because a count without its share
                          (or the reverse) is half the reading.
                          Both sit in fixed-width columns matching the header
                          above, so the figures line up down the panel. */}
                      <span
                        className={`w-10 text-right text-sm tabular-nums ${
                          measure === 'count'
                            ? isEmpty
                              ? 'text-slate-400'
                              : 'font-semibold text-slate-900'
                            : 'text-slate-400'
                        }`}
                      >
                        {value}
                      </span>
                      <span
                        className={`w-16 text-right text-sm tabular-nums ${
                          measure === 'share'
                            ? isEmpty
                              ? 'text-slate-400'
                              : 'font-semibold text-slate-900'
                            : 'text-slate-400'
                        }`}
                      >
                        {share(value)}%
                      </span>
                    </span>
                  </div>

                  {/* The track is the surface the bar is measured against, so
                      it stays a flat neutral - a tinted track reads as a second
                      value stacked behind the first. Fainter still on an empty
                      category, where the track is all there is: at slate-100 a
                      full-width empty track reads as a bar in a lighter
                      colour, which is the opposite of what it means. */}
                  <div
                    className={`mt-1 h-2 w-full overflow-hidden rounded-full ${
                      isEmpty ? 'bg-slate-50' : 'bg-slate-100'
                    }`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${width}%`, backgroundColor: row.color }}
                    />
                  </div>
                </div>

                {/* Reserved whether or not it is showing, so pinning a row
                    doesn't shift the bars sideways under the pointer. */}
                <span className="w-4 shrink-0">
                  {isPinned && hovered === null && (
                    <Pin className="h-3 w-3 text-slate-400" strokeWidth={2.5} aria-label="Pinned" />
                  )}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
