import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

// Anchors the menu under its button, clamped so it never runs off the right
// edge of the viewport.
function menuPositionFor(rect, menuWidth, gap = 4) {
  const maxLeft = window.innerWidth - menuWidth - 8
  return { top: rect.bottom + gap, left: Math.max(8, Math.min(rect.left, maxLeft)) }
}

// A filter-row button that opens a dropdown - click to pick a value,
// "All <Label>s" clears it. Lives next to the search bar rather than in a
// column header. The menu is portaled to <body> (positioned from the button's
// own bounding rect) so it isn't clipped by DataTable's overflow-x-auto row
// container. Shared by the Foundation and Induction boards.
export function FilterDropdown({ label, value, options, onChange }) {
  const buttonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const isActive = Boolean(value)
  const selectedLabel = options.find((option) => option.value === value)?.label

  function toggle() {
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    setMenuPosition(menuPositionFor(buttonRef.current.getBoundingClientRect(), 260))
  }

  const close = () => setMenuPosition(null)

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="max-w-40 truncate">{isActive ? selectedLabel : label}</span>
        <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      </button>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, left: menuPosition.left }}
              className="fixed z-50 max-h-64 w-65 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  close()
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm font-normal ${
                  !value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                All {label}s
              </button>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    close()
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm font-normal ${
                    value === option.value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
