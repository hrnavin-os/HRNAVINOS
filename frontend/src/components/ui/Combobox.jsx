import { useEffect, useId, useRef, useState } from 'react'
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
  const listId = useId()
  const [isOpen, setIsOpen] = useState(false)

  // Typing never removes an option. It used to filter the list down to
  // matches, which had two bad ends: a typo emptied the list and the popup
  // disappeared mid-keystroke, and a value close to two options hid the one
  // you actually wanted before you could see it was there. Now every option
  // stays on screen in its configured order and typing only changes which
  // ones are emphasised - nothing moves under the pointer, and the full list
  // is always one glance away.
  const query = (value ?? '').trim().toLowerCase()
  const isMatch = (option) => Boolean(query) && option.toLowerCase().includes(query)

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
          // The full combobox contract, not half of it: a role that promises
          // a popup has to say which element that popup is and whether it is
          // showing, or a screen reader announces a combobox with nothing
          // attached to it.
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(event) => {
            onChange(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          // onFocus alone is not enough to make a click always open the list:
          // picking an option keeps focus on the input, so the next click
          // fires no focus event and the list stayed shut until you typed or
          // hit the chevron. A click on the field should always show it.
          onClick={() => setIsOpen(true)}
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

        {/* Gated on there being options at all, not on there being matches -
            that was what made the popup vanish the moment a typed value
            stopped matching anything. */}
        {isOpen && options.length > 0 && (
          <div
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          >
            {options.map((option) => {
              const isSelected = option === value
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  // onMouseDown, not onClick: the input's blur fires first and
                  // would close the list before a click could land.
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onChange(option)
                    setIsOpen(false)
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : isMatch(option)
                        ? 'bg-brand-50/40 font-medium text-slate-900 hover:bg-slate-50'
                        : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        )}
      </span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}
