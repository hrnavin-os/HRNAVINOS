import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Opt-in per column via `align`; anything without it stays left, so existing
// tables are unaffected. Header and cells share the setting - centering one
// without the other reads as a misalignment.
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' }

// Column headers stay visible through loading/error/empty states - only the
// body swaps out - so a filter that matches nothing (e.g. a stage card at 0)
// doesn't take the whole table with it.
export function DataTable({ columns, rows, isLoading, error, emptyMessage = 'No records found.', onRowClick }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                  ALIGN[column.align] ?? ALIGN.left
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10">
                <LoadingSpinner />
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10">
                <ErrorMessage message={error} />
              </td>
            </tr>
          ) : !rows?.length ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-sm text-slate-700 ${ALIGN[column.align] ?? ALIGN.left}`}
                  >
                    {column.render ? column.render(row) : row[column.key]}
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
