import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, X } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDate } from '@/utils/formatters'

// "19:14" -> "7:14 PM". The stored value is a plain 24-hour string, which is
// right for storage and wrong for a column somebody scans - and left as-is it
// reads as a duration rather than a time of day.
function formatTime(value) {
  if (!value) return null
  const [hours, minutes] = value.split(':')
  const hour = Number(hours)
  if (Number.isNaN(hour)) return value
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 || 12}:${minutes ?? '00'} ${suffix}`
}

// The induction call's date and time, in one cell, editable in place.
//
// Both were on the fourth page of the Update modal, which meant opening a
// four-step form to read the one thing you need when deciding who to call
// next. They are a single column because they are a single fact: a date with
// no time is half an appointment.
//
// Saved together in one request, so the pair can never be half-written - and
// only `other_details` is sent, which the server merges with exclude_unset, so
// the other four answers on that page are untouched.
export function InductionScheduleCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const dateRef = useRef(null)

  const stored = entry.other_details ?? {}
  const [date, setDate] = useState(stored.induction_call_date?.slice(0, 10) ?? '')
  const [time, setTime] = useState(stored.scheduled_time ?? '')

  // Reopening on a row whose values changed underneath (another user, or the
  // modal) should start from what is stored now, not what it held last time.
  useEffect(() => {
    if (!isEditing) {
      setDate(stored.induction_call_date?.slice(0, 10) ?? '')
      setTime(stored.scheduled_time ?? '')
    }
  }, [isEditing, stored.induction_call_date, stored.scheduled_time])

  useEffect(() => {
    if (isEditing) dateRef.current?.focus()
  }, [isEditing])

  const mutation = useMutation({
    mutationFn: () =>
      inductionEntryService.updateDetails(entry.id, {
        other_details: {
          // Empty inputs clear the field rather than sending "", which the
          // date column would reject as a malformed date.
          induction_call_date: date || null,
          scheduled_time: time || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
      setIsEditing(false)
    },
    onError: (error) =>
      onError?.(`Couldn't save the schedule for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  function cancel() {
    setDate(stored.induction_call_date?.slice(0, 10) ?? '')
    setTime(stored.scheduled_time ?? '')
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div
        className="flex items-center gap-1.5"
        // The row underneath opens the detail popup; editing in place must not
        // also trigger it.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel()
          if (event.key === 'Enter') mutation.mutate()
        }}
      >
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-33 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          aria-label="Save schedule"
          className="rounded-md p-1 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={mutation.isPending}
          aria-label="Cancel"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
        >
          <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const hasDate = Boolean(stored.induction_call_date)
  const hasTime = Boolean(stored.scheduled_time)

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setIsEditing(true)
      }}
      className="group/schedule flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-100"
    >
      <CalendarClock
        className={`h-3.5 w-3.5 shrink-0 ${hasDate || hasTime ? 'text-brand-500' : 'text-slate-300'}`}
        strokeWidth={2}
        aria-hidden="true"
      />
      {hasDate || hasTime ? (
        // Date over time rather than side by side: the column stays narrow,
        // and the date is what you scan down while the time only matters once
        // you have found the day.
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-slate-900">
            {hasDate ? formatDate(stored.induction_call_date) : 'No date'}
          </span>
          <span className="block whitespace-nowrap text-xs text-slate-500">
            {hasTime ? formatTime(stored.scheduled_time) : 'No time'}
          </span>
        </span>
      ) : (
        <span className="whitespace-nowrap text-slate-400 group-hover/schedule:text-slate-600">
          Set schedule
        </span>
      )}
    </button>
  )
}
