import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, header, isOpen, onClose, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!isOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Only a click that lands on the backdrop itself dismisses - comparing
  // target to currentTarget stops a click inside the panel (or a drag that
  // happens to end out here, e.g. selecting text) from closing the modal.
  function onBackdropClick(event) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[1px] sm:p-4"
    >
      {/* Taller on a phone: 85vh leaves a band of backdrop top and bottom that
          is wasted when the panel is the only thing on screen anyway. */}
      <div className={`flex max-h-[92vh] w-full sm:max-h-[85vh] ${maxWidth} flex-col rounded-lg bg-white shadow-xl ring-1 ring-slate-900/5`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          {header ?? <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            {/* The lucide X, not the "✕" character it used to be: the glyph
                came from whatever font was resolved and sat at a different
                weight and baseline to every other icon on the screen. */}
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  )
}
