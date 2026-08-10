import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// A dropdown that still accepts a typed value.
//
// Replaces <input list> + <datalist>: the native datalist popup is drawn by
// the OS, ignores every style you give it, and looks nothing like the rest of
// the form. This renders its own list, so it matches - while staying a plain
// text input underneath, which is what lets a value that isn't on the list
// through.
export function Combobox({ label, value, onChange, options = [], placeholder = 'Select or type…', required, error }) {
  const wrapperRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)

  // Typing filters the list; an exact match doesn't collapse it to one row,
  // so you can still see the neighbours you might have meant.
  const query = (value ?? '').trim().toLowerCase()
  const matches = query ? options.filter((option) => option.toLowerCase().includes(query)) : options

  useEffect(() => {
    if (!isOpen) return undefined
    function onPointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  return (
    <label className="block text-sm" ref={wrapperRef}>
      {label && (
        <span className="mb-1 block font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      <span className="relative block">
        <input
          value={value ?? ''}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => event.key === 'Escape' && setIsOpen(false)}
          className={`w-full rounded-md border px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm
            focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
            ${error ? 'border-red-400' : 'border-slate-300'}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? 'Hide options' : 'Show options'}
          onClick={() => setIsOpen((open) => !open)}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>

        {isOpen && matches.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {matches.map((option) => (
              <button
                key={option}
                type="button"
                // onMouseDown, not onClick: the input's blur fires first and
                // would close the list before a click could land.
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(option)
                  setIsOpen(false)
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                  option === value ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}
