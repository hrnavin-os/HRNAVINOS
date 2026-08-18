// The card every board section sits in. One shape for all five boards, so a
// dashboard of twenty panels reads as one screen rather than twenty widgets
// that each arrived from somewhere else.
export function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

// Nothing to draw. Said in words rather than left as an empty card, because a
// blank panel reads as a chart that failed to load.
export function EmptyNote({ children }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>
}
