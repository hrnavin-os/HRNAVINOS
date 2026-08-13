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
  // A clickable row has to be reachable and operable from the keyboard too -
  // a bare onClick on <tr> is mouse-only.
  const rowKeyDown = (row) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick(row)
    }
  }

  return (
    // Capped height so the horizontal scrollbar stays put. Left to grow, the
    // scroll box ends wherever the last row does, which on a long table is far
    // below the fold - you had to scroll the page to the bottom to reach the
    // bar that scrolls the columns. Bounded, the box scrolls its own rows and
    // the bar sits at its bottom edge, on screen the whole time.
    //
    // The 20rem allows for the header, page padding, a stat row, the toolbar
    // and the pagination beneath. Pages with less chrome than that get a table
    // slightly shorter than it could be, which is the cheap direction to be
    // wrong in; --table-max-h overrides it where that matters. Short tables
    // never reach the cap and are unaffected.
    // The cap is lifted below sm. On a phone the chrome above the table is
    // taller relative to the viewport, so subtracting a desktop-sized 20rem
    // left a box a couple of rows deep inside a page that scrolls anyway - and
    // a pinned horizontal scrollbar buys nothing on a touch screen, where you
    // drag the table itself.
    <div
      className="table-scroll w-full overflow-auto max-sm:max-h-none!"
      style={{ maxHeight: 'var(--table-max-h, calc(100vh - 20rem))' }}
    >
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                // Sticky because the box scrolls its own rows now - column
                // headings that scroll away leave you reading unlabelled
                // columns. Works because the table is border-separate:
                // collapsed borders are painted on the table, not the cell,
                // and vanish the moment a header sticks.
                className={`sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${EDGE_PADDING} ${
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
                onClick={onRowClick ? () => onRowClick(row) : undefined}
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
  )
}
