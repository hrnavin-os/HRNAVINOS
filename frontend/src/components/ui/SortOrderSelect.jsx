import { useState } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'

const SORT_OPTIONS = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc', label: 'Oldest first' },
]

/**
 * Newest-or-oldest for a board's toolbar, shared by the Foundation and
 * Induction lists so one board can't end up wording its ordering differently
 * from the other.
 *
 * A custom listbox rather than a native <select> because the browser draws the
 * native option list itself, dropping the styling below and keeping the OS blue
 * highlight. The chrome deliberately matches FilterDropdown: it sits in the
 * same toolbar row, and a control there that looks like it came from a
 * different app is the thing this is avoiding.
 *
 * Unlike a filter it always shows its value and has no cleared state - a list
 * is always in some order, and "unset" would just be one of the two under
 * another name. `grow` fills the cell it's placed in, for a toolbar laid out
 * as a grid.
 */
export function SortOrderSelect({ value, onChange, grow = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = SORT_OPTIONS.find((option) => option.value === value)?.label

  return (
    <div className={`relative ${grow ? 'min-w-0' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex h-9 items-center justify-between gap-2 rounded-md border px-3 text-sm
          font-medium text-slate-600 outline-none transition-colors ${grow ? 'w-full' : 'w-38'} ${
            isOpen
              ? 'border-brand-400 bg-white ring-1 ring-brand-400'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
          }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ArrowUpDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            className={`absolute left-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl ${
              grow ? 'w-full min-w-38' : 'w-38'
            }`}
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  value === option.value
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'font-normal text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option.label}
                {value === option.value && (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
