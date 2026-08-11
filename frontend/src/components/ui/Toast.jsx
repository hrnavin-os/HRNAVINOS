import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

const TONES = {
  error: { border: 'border-red-200', plate: 'bg-red-100 text-red-600', icon: AlertCircle },
  success: { border: 'border-emerald-200', plate: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 },
}

// Transient notice for actions with no form to attach a message to - inline
// table edits in particular, which otherwise fail silently and leave the user
// believing their change saved.
//
// `action` is what makes a one-click, no-confirmation action safe to offer:
// the undo lives here rather than in a dialog beforehand, so the common case
// costs one click and the mistake costs two.
export function Toast({ message, onDismiss, duration = 6000, tone = 'error', action }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [message, onDismiss, duration])

  if (!message) return null

  const style = TONES[tone] ?? TONES.error
  const Icon = style.icon

  return createPortal(
    <div
      role="alert"
      // Sits above the mobile tab bar, which is fixed to the bottom of the
      // screen and would otherwise cover the toast - including its Undo. The
      // breakpoint is md because that is where the bar disappears.
      className={`fixed inset-x-4 bottom-24 z-100 flex items-start gap-2.5 rounded-lg border bg-white p-3.5 shadow-lg md:inset-x-auto md:bottom-5 md:right-5 md:max-w-sm ${style.border}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${style.plate}`}>
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{message}</p>
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick()
              onDismiss()
            }}
            className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            {action.label}
          </button>
        )}
      </div>
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
