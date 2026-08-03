import { Eye, Pencil, Trash2 } from 'lucide-react'

const BUTTON = `rounded-md p-1.5 text-slate-500 transition-colors
  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500`

// View / Edit / Delete icons for a single table row. Each handler is optional -
// pass only the ones the caller supports (and is permitted to use) and the rest
// simply aren't rendered. `lockedReason` disables Edit + Delete and surfaces the
// reason as the tooltip, e.g. system roles the API refuses to modify.
export function RowActions({ onView, onEdit, onDelete, lockedReason, deleteLockedReason }) {
  const noDelete = lockedReason ?? deleteLockedReason ?? null

  // Rows are clickable on some pages (DataTable's onRowClick); keep a button
  // press from also triggering the row handler behind it.
  const handle = (action) => (event) => {
    event.stopPropagation()
    action()
  }

  return (
    <div className="flex items-center gap-1">
      {onView && (
        <button
          type="button"
          onClick={handle(onView)}
          title="View details"
          aria-label="View details"
          className={`${BUTTON} hover:bg-slate-100 hover:text-slate-700`}
        >
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={handle(onEdit)}
          disabled={Boolean(lockedReason)}
          title={lockedReason ?? 'Edit'}
          aria-label="Edit"
          className={`${BUTTON} hover:bg-brand-50 hover:text-brand-600`}
        >
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={handle(onDelete)}
          disabled={Boolean(noDelete)}
          title={noDelete ?? 'Delete'}
          aria-label="Delete"
          className={`${BUTTON} hover:bg-red-50 hover:text-red-600`}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
