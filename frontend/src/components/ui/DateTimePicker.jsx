import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Calendar } from '@/components/ui/DatePresetFilter'

// Local calendar day as YYYY-MM-DD. Not toISOString(), which converts to UTC
// first and hands back yesterday for anyone east of Greenwich.
function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const QUARTERS = [0, 15, 30, 45]

// "2026-09-26T10:30" -> its parts in 12-hour form, or the defaults (no day,
// 10:00 AM - the start of a calling day) for an empty value.
function parse(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  if (!match) return { day: '', hour: 10, minute: 0, pm: false }
  const hour24 = Number(match[2])
  return { day: match[1], hour: hour24 % 12 || 12, minute: Number(match[3]), pm: hour24 >= 12 }
}

function compose({ day, hour, minute, pm }) {
  if (!day) return ''
  const hour24 = (hour % 12) + (pm ? 12 : 0)
  return `${day}T${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** True when a picked `YYYY-MM-DDTHH:mm` value is still ahead of now. */
export function isFutureDateTime(value) {
  return Boolean(value) && new Date(value).getTime() > Date.now()
}

// One option in a row of them: the time chips and the AM/PM switch. The same
// selected state the calendar uses, so the day and the time read as one
// control rather than a calendar with a native widget bolted on.
function Chip({ selected, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`h-9 rounded-md text-sm tabular-nums transition-colors ${
        selected ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * A date and a time, picked in the app's own calendar and chips rather than
 * the browser's datetime widget - which looks different in every browser and
 * nothing like the rest of the app.
 *
 * `value` and `onChange` deal in the same local `YYYY-MM-DDTHH:mm` string a
 * datetime-local input would, so it drops in where one was. Days before today
 * are disabled; a time earlier today is the caller's to refuse (see
 * isFutureDateTime), since only it knows whether the past is acceptable.
 */
export function DateTimePicker({ value, onChange, label = 'Date and time' }) {
  const [parts, setParts] = useState(() => parse(value))

  function update(patch) {
    const next = { ...parts, ...patch }
    setParts(next)
    onChange(compose(next))
  }

  // A saved time off the quarter hours (10:07) stays pickable as itself.
  const minutes = QUARTERS.includes(parts.minute) ? QUARTERS : [...QUARTERS, parts.minute].sort((a, b) => a - b)
  const picked = compose(parts)

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">{label}</p>
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-3.5 sm:grid-cols-2">
        <Calendar from={parts.day} to={parts.day} min={isoDay(new Date())} onPick={(day) => update({ day })} />

        <div className="space-y-3 sm:border-l sm:border-slate-100 sm:pl-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hour</p>
            <div className="grid grid-cols-6 gap-1">
              {HOURS.map((hour) => (
                <Chip key={hour} selected={parts.hour === hour} onClick={() => update({ hour })}>
                  {hour}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Minute</p>
            <div className="grid grid-cols-4 gap-1">
              {minutes.map((minute) => (
                <Chip key={minute} selected={parts.minute === minute} onClick={() => update({ minute })}>
                  :{String(minute).padStart(2, '0')}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Chip selected={!parts.pm} onClick={() => update({ pm: false })}>
              AM
            </Chip>
            <Chip selected={parts.pm} onClick={() => update({ pm: true })}>
              PM
            </Chip>
          </div>
        </div>
      </div>

      {/* What will be saved, in words - the chips alone make you add it up. */}
      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} aria-hidden="true" />
        {picked ? (
          <span className="font-medium text-slate-900">
            {new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(picked))}
          </span>
        ) : (
          <span className="text-slate-500">Pick a day in the calendar</span>
        )}
      </p>
    </div>
  )
}
