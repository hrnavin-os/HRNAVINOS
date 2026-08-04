import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, X } from 'lucide-react'

// Transient failure notice for actions with no form to attach an error to -
// inline table edits in particular, which otherwise fail silently and leave
// the user believing their change saved.
export function Toast({ message, onDismiss, duration = 6000 }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [message, onDismiss, duration])

  if (!message) return null

  return createPortal(
    <div
      role="alert"
      className="fixed bottom-5 right-5 z-100 flex max-w-sm items-start gap-2.5 rounded-lg border border-red-200 bg-white p-3.5 shadow-lg"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600">
        <AlertCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-slate-700">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  )
}
