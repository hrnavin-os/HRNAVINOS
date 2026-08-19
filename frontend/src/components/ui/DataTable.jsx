import { useEffect, useRef, useState } from 'react'
import { Inbox } from 'lucide-react'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Opt-in per column via `align`; anything without it stays left, so existing
// tables are unaffected. Header and cells share the setting - centering one
// without the other reads as a misalignment.
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' }

// Edge cells get extra padding so the first and last columns aren't jammed
// against the card border.
const EDGE_PADDING = 'first:pl-5 last:pr-5'

// Placeholder rows while the query is in flight. A spinner here collapses the
// table to a single row and the whole page jumps when the data lands; bars
// keep the layout at roughly its final height instead.
function SkeletonRows({ columns, rows = 5 }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr key={rowIndex}>
      {columns.map((column) => (
        <td key={column.key} className={`px-4 py-3.5 ${EDGE_PADDING}`}>
          <div
            className="h-3.5 animate-pulse rounded bg-slate-100"
            // Varied widths read as content loading; identical bars read as a
            // broken grid. Deterministic so rows don't reshuffle on re-render.
            style={{ width: `${55 + ((rowIndex * 7 + column.key.length * 11) % 40)}%` }}
          />
        </td>
      ))}
    </tr>
  ))
}

export function DataTable({ columns, rows, isLoading, error, emptyMessage = 'No records found.', onRowClick }) {
  const boxRef = useRef(null)
  const barRef = useRef(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  // The proxy bar has to be exactly as wide as the table to scroll it 1:1, and
  // the table's width isn't known at mount - columns arrive with the data. So
  // it's measured, and re-measured whenever the box or the table resizes.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    const measure = () => {
      setScrollWidth(box.scrollWidth)
      // The +1 absorbs sub-pixel widths. Compared exactly, a table that fits
      // reports a fractional pixel of overflow and every table in the app gets
      // a scrollbar it doesn't need.
      setOverflowing(box.scrollWidth > box.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    // The box is width-constrained by the card, so it alone never reports the
    // change - the table inside it is what actually grows.
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    return () => observer.disconnect()
  }, [])

  // Assigning only when the two differ is what stops them bouncing scroll
  // events off each other: setting scrollLeft to the value it already holds
  // fires no event, so the echo dies on the first hop.
  const sync = (from, to) => () => {
    if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft) {
      to.current.scrollLeft = from.current.scrollLeft
    }
  }

  // Anything a cell puts in the row that is operable in its own right: the
  // inline dropdowns, the remarks popover, the schedule editor, an action
  // button. A click or a keypress that lands on one of these belongs to it,
  // not to the row underneath.
  //
  // Matched on the DOM rather than on React's tree, which is what makes it
  // work for the popups: they are portaled to <body>, so they are nowhere
  // near the row in the document, but React still routes their events up the
  // component tree and into these handlers.
  const CONTROLS = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'

  // A clickable row has to be reachable and operable from the keyboard too -
  // a bare onClick on <tr> is mouse-only.
  //
  // Only when the row itself has the key, though. Space is "press this row"
  // to a focused row and a space character to everything else, and a handler
  // that took both preventDefault()ed the space out of the remarks box and
  // opened the detail popup on top of it - the keypress went to the row that
  // happened to contain the textarea rather than to the textarea.
  const rowKeyDown = (row) => (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick(row)
    }
  }

  // Same rule for the pointer: clicking a dropdown option, a popover's Save,
  // or the click-away behind one must not also open the row. Handled here
  // rather than by a stopPropagation in every cell that grows a popup, which
  // is a thing each new one has to remember and one of them always forgets.
  const rowClick = (row) => (event) => {
    if (event.target.closest?.(CONTROLS)) return
    onRowClick(row)
  }

  return (
    // The frame exists to bound how far the sticky bar can travel. Sticky is
    // positioned within its nearest block-container ancestor, so without this
    // the bar's range would be the whole card and it would drift down over the
    // pagination. Bounded here, it can only reach the bottom of the table.
    <div className="table-frame relative">
      {/* Horizontal only, and no height cap: a table never scrolls inside
          itself, the page scrolls it. Its own scrollbar is hidden (.table-box)
          because the sticky proxy below is the one you see and drag - two bars
          for one axis would be scrolling the same thing twice. */}
      <div ref={boxRef} onScroll={sync(boxRef, barRef)} className="table-box w-full overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  // Not sticky. It was, back when the box was capped to the
                  // viewport and scrolled its own rows - headings that scrolled
                  // away left you reading unlabelled columns. The box has no
                  // height cap now, so there is nothing for a heading to stick
                  // against and the class only looked like it did something.
                  //
                  // border-separate stays: it is what lets each cell paint its
                  // own border, which the collapsed default would hoist onto the
                  // table instead.
                  className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${EDGE_PADDING} ${
                    ALIGN[column.align] ?? ALIGN.left
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoading ? (
              <SkeletonRows columns={columns} />
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10">
                  <ErrorMessage message={error} />
                </td>
              </tr>
            ) : !rows?.length ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Inbox className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <p className="max-w-md text-sm text-slate-500">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  // Falls back to the index for aggregate rows, which are grouped
                  // sums rather than records and carry no id - without it every
                  // row in a report table keys on undefined.
                  key={row.id ?? index}
                  onClick={onRowClick ? rowClick(row) : undefined}
                  onKeyDown={onRowClick ? rowKeyDown(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={`group transition-colors hover:bg-brand-50/50 ${
                    onRowClick ? 'cursor-pointer focus:bg-brand-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500' : ''
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      // Cells stay on one line by default: a value wrapping to
                      // two or three lines makes every row in the table that
                      // tall, and the container already scrolls horizontally.
                      // Opt a column out with `wrap: true` when the content is
                      // genuinely long-form.
                      className={`border-b border-slate-100 px-4 py-3 text-sm text-slate-700 group-last:border-b-0 ${EDGE_PADDING} ${
                        ALIGN[column.align] ?? ALIGN.left
                      } ${column.numeric ? 'tabular-nums' : ''} ${column.wrap ? '' : 'whitespace-nowrap'}`}
                    >
                      {/* Second arg is the row's index within this page; columns
                          that don't need it simply ignore it. */}
                      {column.render ? column.render(row, index) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* The bar you actually see: an empty box as wide as the table, scrolled
          in lockstep with it. A real scrollbar cannot be pinned - it belongs to
          its box and sits at that box's bottom edge - so pinning one means
          detaching it from the table and sticking the copy instead.

          Only rendered when the table is wider than its card. A scrollbar for
          content that already fits is a control that does nothing.

          md and up only. It sticks to the bottom of the scrolling <main>, which
          on a phone is behind the fixed tab bar - and a pinned bar buys nothing
          on a touch screen, where you drag the table itself. Below md the box
          keeps its own native scrollbar instead (see .table-box).

          aria-hidden and not focusable: it duplicates a box the keyboard can
          already scroll, so exposing it would put a second, identical stop in
          the tab order. */}
      {overflowing && (
        <div
          ref={barRef}
          onScroll={sync(barRef, boxRef)}
          aria-hidden="true"
          className="table-scroll sticky bottom-0 z-20 hidden h-3 overflow-x-auto overflow-y-hidden bg-white md:block"
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
    </div>
  )
}
