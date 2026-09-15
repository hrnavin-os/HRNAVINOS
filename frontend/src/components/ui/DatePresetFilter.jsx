import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/utils/formatters'

// Local calendar day as YYYY-MM-DD. Not toISOString(), which converts to UTC
// first and hands back yesterday for anyone east of Greenwich.
function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

// First and last day of the month `offset` months from this one.
function month(offset) {
  const now = new Date()
  return [new Date(now.getFullYear(), now.getMonth() + offset, 1), new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)]
}

// Sunday to Saturday of the current week, matching the calendar's columns.
function thisWeek() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  return [start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)]
}

// Functions rather than values: the board stays open across midnight, and
// "Today" has to mean the day it is when you pick it.
const RANGES = {
  today: { label: 'Today', range: () => [shiftDays(0), shiftDays(0)] },
  yesterday: { label: 'Yesterday', range: () => [shiftDays(-1), shiftDays(-1)] },
  this_week: { label: 'This Week', range: thisWeek },
  this_month: { label: 'This Month', range: () => month(0) },
  last_month: { label: 'Last Month', range: () => month(-1) },
}

const QUICK = ['today', 'this_week', 'this_month']
const MODAL_PRESETS = ['today', 'yesterday', 'last_month', 'this_month']
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function toRange(key) {
  const [start, end] = RANGES[key].range()
  return { from: isoDay(start), to: isoDay(end), preset: key }
}

function customLabel({ from, to }) {
  if (from === to) return formatDate(from)
  return `${formatDate(from)} – ${formatDate(to)}`
}

function Calendar({ from, to, onPick }) {
  const initial = from ? new Date(`${from}T00:00:00`) : new Date()
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const today = isoDay(new Date())

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => isoDay(new Date(view.year, view.month, index + 1))),
  ]
  const title = new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function move(delta) {
    setView(({ year, month: current }) => {
      const next = new Date(year, current + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Next month"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-[11px] font-semibold text-slate-400">
            {day}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />
          const isEdge = day === from || day === to
          const inRange = from && to && day > from && day < to
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              className={`h-9 rounded-md text-sm transition-colors ${
                isEdge
                  ? 'bg-brand-600 font-semibold text-white'
                  : inRange
                    ? 'bg-brand-50 text-brand-700'
                    : day === today
                      ? 'font-semibold text-brand-700 ring-1 ring-brand-300'
                      : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Date filter as a row of quick buttons - All, Today, This Week, This Month -
 * plus Custom, which opens a dialog with more presets and a calendar for any
 * single day or range. `value` is `{ from, to, preset }` or null, the same
 * shape DateFilter uses, so the boards send the same two params either way.
 */
export function DatePresetFilter({ value, onChange, grow = false }) {
  const [isOpen, setIsOpen] = useState(false)
  // A range being picked in the calendar: the first click sets the start and
  // waits here; the second sets the end and applies.
  const [pendingStart, setPendingStart] = useState(null)

  const isCustom = value && !QUICK.includes(value.preset)

  function close() {
    setIsOpen(false)
    setPendingStart(null)
  }

  function apply(next) {
    onChange(next)
    close()
  }

  function pickDay(day) {
    if (!pendingStart) {
      setPendingStart(day)
      return
    }
    const [from, to] = day < pendingStart ? [day, pendingStart] : [pendingStart, day]
    apply({ from, to, preset: null })
  }

  const buttonClass = (active) =>
    `inline-flex h-9.5 items-center justify-center gap-1.5 ${grow ? 'flex-1' : ''} whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors ${
      active
        ? 'border-brand-600 bg-brand-600 text-white'
        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'
    }`

  const calendarFrom = pendingStart ?? value?.from
  const calendarTo = pendingStart ? null : value?.to
  const status = pendingStart
    ? `${formatDate(pendingStart)} – pick an end date, or the same day again`
    : value
      ? customLabel(value)
      : 'No date picked'

  return (
    <>
      {/* `grow` stretches the buttons to fill the cell the filter sits in. */}
      <div className={`flex items-center gap-1.5 ${grow ? 'w-full' : 'flex-wrap'}`} role="group" aria-label="Date">
        <button type="button" className={buttonClass(!value)} onClick={() => onChange(null)}>
          All
        </button>
        {QUICK.map((key) => (
          <button
            key={key}
            type="button"
            className={buttonClass(value?.preset === key)}
            onClick={() => onChange(toRange(key))}
          >
            {RANGES[key].label}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass(isCustom)}
          onClick={() => setIsOpen(true)}
          title={isCustom ? customLabel(value) : undefined}
        >
          <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {isCustom ? (value.preset ? RANGES[value.preset].label : customLabel(value)) : 'Custom'}
        </button>
      </div>

      <Modal title="Filter by Date" isOpen={isOpen} onClose={close} maxWidth="max-w-xl">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex shrink-0 flex-row flex-wrap gap-1 sm:w-40 sm:flex-col">
            {MODAL_PRESETS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => apply(toRange(key))}
                className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  value?.preset === key ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {RANGES[key].label}
              </button>
            ))}
            <span
              className={`rounded-md px-3 py-2 text-left text-sm font-medium ${
                isCustom && !value.preset ? 'bg-brand-50 text-brand-700' : 'text-slate-700'
              }`}
            >
              Custom Range
            </span>
          </div>

          <div className="min-w-0 flex-1 rounded-lg border border-slate-200 p-4">
            <Calendar from={calendarFrom} to={calendarTo} onPick={pickDay} />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => apply(toRange('today'))}
                className="text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                Today
              </button>
              <p className="truncate text-xs text-slate-500">{status}</p>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
