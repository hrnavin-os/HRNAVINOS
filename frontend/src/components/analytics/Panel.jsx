import { Info } from 'lucide-react'

/**
 * The card every view on the canvas sits in: a title, the sentence that says
 * what it is counting, an optional control on the right, and the view itself.
 *
 * One shape for all of them, so a screen of six panels reads as one screen
 * rather than six widgets that each arrived from somewhere else.
 *
 * The header is a banded strip - accent bar, title, hairline underneath -
 * rather than text floating above the content. On a dense board the eye needs
 * to find where one panel ends and the next begins without measuring
 * whitespace, and a ruled header does that at any zoom level.
 *
 * `hint` becomes the little (i) beside the title. It carries the caveat a
 * subtitle shouldn't have to - how a number is derived, what it excludes -
 * where it is available to anyone who wants it and in nobody's way.
 */
export function Panel({ title, subtitle, hint, action, children, className = '' }) {
  return (
    <section
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          {/* The accent bar. Same device as the KPI rail one row above, so the
              header reads as belonging to the same board rather than to a
              chart library that was dropped into it. */}
          <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <span className="min-w-0 truncate">{title}</span>
              {hint && (
                <span title={hint} className="shrink-0 text-slate-300 transition-colors hover:text-slate-500">
                  <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  <span className="sr-only">{hint}</span>
                </span>
              )}
            </h2>
            {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
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
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-md border border-slate-200 bg-white p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
            value === option.value ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'
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
