import { Info } from 'lucide-react'

/**
 * The card every view on the canvas sits in: a title, the sentence that says
 * what it is counting, an optional control on the right, and the view itself.
 *
 * One shape for all of them, so a screen of six panels reads as one screen
 * rather than six widgets that each arrived from somewhere else.
 *
 * `hint` becomes the little (i) beside the title. It carries the caveat a
 * subtitle shouldn't have to - how a number is derived, what it excludes -
 * where it is available to anyone who wants it and in nobody's way.
 */
export function Panel({ title, subtitle, hint, action, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            <span className="min-w-0 truncate">{title}</span>
            {hint && (
              <span title={hint} className="shrink-0 text-slate-300 transition-colors hover:text-slate-500">
                <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                <span className="sr-only">{hint}</span>
              </span>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

/**
 * A two-or-three way switch for what a panel is showing - counts or shares,
 * this many rows or that many.
 *
 * A segmented control rather than a dropdown: the options are few, short and
 * worth seeing at once, and which one is on is then readable without opening
 * anything.
 */
export function SegmentedToggle({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === option.value
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Nothing to draw. Said in words rather than left as an empty card, because a
// blank panel reads as a chart that failed to load.
export function EmptyNote({ children }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>
}
