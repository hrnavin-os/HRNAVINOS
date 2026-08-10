import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'

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
// `grow` lets a row of these share the full width evenly instead of bunching
// at the left. Off by default so the Foundation board's row, where they sit
// beside other controls, keeps its natural widths.
export function FilterDropdown({ label, value, options, onChange, grow = false }) {
  const shellRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const isActive = Boolean(value)
  const isOpen = Boolean(menuPosition)
  const selectedLabel = options.find((option) => option.value === value)?.label

  function toggle() {
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    // Measured from the shell, not the inner button, so the menu lines up with
    // the control's visible left edge even when the clear "x" is showing.
    setMenuPosition(menuPositionFor(shellRef.current.getBoundingClientRect(), 260))
  }

  const close = () => setMenuPosition(null)

  return (
    <div className={grow ? 'min-w-32 flex-1' : 'inline-block'}>
      {/* The border lives on this shell rather than the trigger so the clear
          "x" can sit inside the same outline - two adjacent bordered buttons
          read as two controls, which is not what this is. */}
      <div
        ref={shellRef}
        className={`flex items-center rounded-md border transition-colors ${grow ? 'w-full' : ''} ${
          isActive
            ? 'border-brand-300 bg-brand-50 hover:bg-brand-100'
            : isOpen
              ? 'border-brand-400 bg-white ring-1 ring-brand-400'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pl-3.5 text-sm outline-none ${
            isActive ? 'pr-1.5 font-semibold text-brand-700' : 'pr-3 font-medium text-slate-600'
          } ${grow ? 'justify-between' : ''}`}
        >
          <span className="max-w-40 truncate">{isActive ? selectedLabel : label}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${
              isActive ? 'text-brand-500' : 'text-slate-400'
            }`}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
        {isActive && (
          // Clearing one of six filters shouldn't mean reopening its menu to
          // hunt for "All ...".
          <button
            type="button"
            onClick={() => onChange('')}
            title={`Clear ${label}`}
            aria-label={`Clear ${label}`}
            className="mr-1 shrink-0 rounded p-1 text-brand-500 transition-colors hover:bg-brand-200/60 hover:text-brand-800"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
      </div>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, left: menuPosition.left }}
              className="fixed z-50 max-h-64 w-65 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
            >
              {/* Names the filter, which the trigger stops showing once a value
                  is picked - so an open menu always says what it filters. */}
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <MenuOption label={`All ${label}s`} isSelected={!value} onClick={() => { onChange(''); close() }} />
              {options.map((option) => (
                <MenuOption
                  key={option.value}
                  label={option.label}
                  isSelected={value === option.value}
                  onClick={() => {
                    onChange(option.value)
                    close()
                  }}
                />
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

// A tick marks the current choice as well as the tint, so the selected row is
// still obvious to anyone who can't pick the tint out from white.
function MenuOption({ label, isSelected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
        isSelected ? 'bg-brand-50 font-medium text-brand-700' : 'font-normal text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
    </button>
  )
}
