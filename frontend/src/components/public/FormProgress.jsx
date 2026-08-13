import { Check } from 'lucide-react'

// Where you are in a multi-step form, and how much is left.
//
// The bar between steps carries the progress rather than the numbers alone: a
// row of circles tells you which step you're on, but not how far through you
// are, which is the thing that decides whether somebody finishes the form.
//
// Labels are hidden below sm - three of them across a 360px screen truncate to
// nothing useful - and the step name is printed once underneath instead.
export function FormProgress({ current, labels }) {
  return (
    <div className="mb-6">
      <ol className="flex items-center">
        {labels.map((label, index) => {
          const step = index + 1
          const done = step < current
          const active = step === current
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    done
                      ? 'bg-brand-600 text-white'
                      : active
                        ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : step}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-[11px] font-medium sm:block ${
                    active ? 'text-brand-700' : 'text-slate-400'
                  }`}
                >
                  {label}
                </span>
              </div>
              {step < labels.length && (
                // -mt-5 lifts the connector onto the circles' centre line
                // rather than the block's, which the labels below would
                // otherwise drag it off.
                <span
                  className={`-mt-5 h-0.5 flex-1 rounded-full transition-colors ${
                    done ? 'bg-brand-600' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-center text-xs font-medium text-slate-500 sm:hidden">
        Step {current} of {labels.length} — {labels[current - 1]}
      </p>
    </div>
  )
}
