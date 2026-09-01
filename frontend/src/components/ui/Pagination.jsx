import { ChevronLeft, ChevronRight } from 'lucide-react'

// Footer of the table card: what you're looking at on the left, the controls
// on the right. `total`/`pageSize` are optional - without them it falls back
// to "Page X of Y", so callers that don't track a total still work.
export function Pagination({ page, totalPages, onPageChange, total, pageSize }) {
  const hasRange = Number.isFinite(total) && Number.isFinite(pageSize) && total > 0
  // Nothing to say and nowhere to go.
  if (totalPages <= 1 && !hasRange) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const button = `inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5
    text-sm font-medium text-slate-600 transition-colors
    hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900
    disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200
    disabled:hover:bg-white disabled:hover:text-slate-600`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-2.5">
      <p className="text-xs text-slate-500">
        {hasRange ? (
          <>
            Showing <span className="font-medium text-slate-700 tabular-nums">{from}</span>–
            <span className="font-medium text-slate-700 tabular-nums">{to}</span> of{' '}
            <span className="font-medium text-slate-700 tabular-nums">{total}</span>
          </>
        ) : (
          <>
            Page <span className="font-medium text-slate-700 tabular-nums">{page}</span> of{' '}
            <span className="font-medium text-slate-700 tabular-nums">{totalPages}</span>
          </>
        )}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={button} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Previous
          </button>
          <span className="px-1 text-xs text-slate-400 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className={button}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
