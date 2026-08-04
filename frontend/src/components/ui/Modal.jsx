import { useEffect } from 'react'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className={`flex max-h-[85vh] w-full ${maxWidth} flex-col rounded-lg bg-white shadow-xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          {header ?? <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
