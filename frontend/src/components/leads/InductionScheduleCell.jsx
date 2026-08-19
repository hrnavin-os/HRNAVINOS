import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { anchorPopup } from '@/utils/anchorPopup'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/utils/formatters'

const POPUP_WIDTH = 232
const POPUP_HEIGHT = 250

// "19:14" -> "7:14 PM". The stored value is a plain 24-hour string, which is
// right for storage and wrong for a column somebody scans - left as-is it
// reads as a duration rather than a time of day.
function formatTime(value) {
  if (!value) return null
  const [hours, minutes] = value.split(':')
  const hour = Number(hours)
  if (Number.isNaN(hour)) return value
  const suffix = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 || 12}:${minutes ?? '00'} ${suffix}`
}

// The induction call's date and time, in one cell.
//
// They are one column because they are one fact: a date with no time is half
// an appointment. Both used to sit on the fourth page of the Update modal,
// which meant opening a four-step form to read the thing you need when
// deciding who to call next.
//
// The two native pickers live in a popover rather than in the cell. Inline,
// they forced the column to about 380px - a date input and a time input both
// carry a browser-drawn calendar or clock button and refuse to shrink past it
// - so the whole table had to be wider for a control that is only on screen
// while somebody is typing into it. The cell now costs what the value costs to
// display, and the editor borrows space from the page. Same shape the remark
// and category columns already use.
export function InductionScheduleCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const triggerRef = useRef(null)
  const dateRef = useRef(null)
  const [popup, setPopup] = useState(null)

  const stored = entry.other_details ?? {}
  const storedDate = stored.induction_call_date?.slice(0, 10) ?? ''
  const storedTime = stored.scheduled_time ?? ''

  const [date, setDate] = useState(storedDate)
  const [time, setTime] = useState(storedTime)

  useEffect(() => {
    if (popup) dateRef.current?.focus()
  }, [popup])

  const mutation = useMutation({
    mutationFn: () =>
      inductionEntryService.updateDetails(entry.id, {
        // Only this page, and only these two keys. The server merges each page
        // with exclude_unset, so the other four answers under other_details are
        // left exactly as the Update form set them.
        other_details: {
          // Empty inputs clear the field rather than sending "", which the date
          // column would reject as a malformed date.
          induction_call_date: date || null,
          scheduled_time: time || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
      setPopup(null)
    },
    onError: (error) =>
      onError?.(`Couldn't save the schedule for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  function open(event) {
    event.stopPropagation()
    if (popup) {
      setPopup(null)
      return
    }
    // Seeded from what is stored at open time, so a row changed underneath
    // starts from the current value rather than whatever was typed before.
    setDate(storedDate)
    setTime(storedTime)
    mutation.reset()
    setPopup(anchorPopup(triggerRef.current.getBoundingClientRect(), POPUP_WIDTH, POPUP_HEIGHT))
  }

  const hasDate = Boolean(stored.induction_call_date)
  const hasTime = Boolean(stored.scheduled_time)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="group/schedule flex w-full max-w-40 items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-slate-100"
      >
        <CalendarClock
          className={`h-3.5 w-3.5 shrink-0 ${hasDate || hasTime ? 'text-brand-500' : 'text-slate-300'}`}
          strokeWidth={2}
          aria-hidden="true"
        />
        {hasDate || hasTime ? (
          // Date over time rather than side by side: keeps the column narrow,
          // and the date is what you scan down while the time only matters
          // once you have found the day.
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

      {popup &&
        createPortal(
          <>
            {/* Click-away. Its own element rather than a document listener, so
                dismissing cannot also reach the row underneath and open the
                detail popup. */}
            <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} aria-hidden="true" />
            <div
              style={{ top: popup.top, left: popup.left, width: POPUP_WIDTH }}
              className="fixed z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setPopup(null)
                if (event.key === 'Enter') mutation.mutate()
              }}
            >
              <label className="block text-xs font-medium text-slate-600">
                Date
                <input
                  ref={dateRef}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>
              <label className="mt-2.5 block text-xs font-medium text-slate-600">
                Time
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
                <Button
                  variant="ghost"
                  className="px-2! py-1! text-xs"
                  onClick={() => setPopup(null)}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="px-2.5! py-1! text-xs"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
