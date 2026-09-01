import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { anchorPopup } from '@/utils/anchorPopup'

// Matches Lead.remarks' server-side cap, so an over-long paste is stopped at
// the textarea instead of coming back as an opaque 422.
const REMARKS_MAX_LENGTH = 2000

const POPUP_WIDTH = 320
const POPUP_HEIGHT = 520

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// "YYYY-MM-DD" for a local date. toISOString() can't be used for this: it
// converts to UTC first, so an evening in IST is already tomorrow's date by
// the time it formats - which would mark the wrong day on the calendar.
function toValue(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayValue() {
  const now = new Date()
  return toValue(now.getFullYear(), now.getMonth(), now.getDate())
}

// The cells of one month's grid, padded with nulls so the 1st lands under its
// real weekday - the leading blanks are what make the numbers line up in
// columns you can read down.
function monthGrid(year, month) {
  const leading = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= days; day += 1) cells.push({ day, value: toValue(year, month, day) })
  // Trailing blanks so the last row is a full week and the grid keeps its
  // shape instead of the popup resizing as you page through months.
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function formatMonth(year, month) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
}

// "2026-09-01" -> "Today" / "Yesterday" / "Tue, 1 Sep". The relative words are
// faster to recognise than a date, and they are what most of the reading here
// is about. Year only when it isn't the current one.
function formatDayLabel(value) {
  const today = todayValue()
  if (value === today) return 'Today'

  const date = new Date(`${value}T00:00:00`)
  const shifted = (days) => {
    const other = new Date(`${today}T00:00:00`)
    other.setDate(other.getDate() + days)
    return other.getTime()
  }
  if (date.getTime() === shifted(-1)) return 'Yesterday'
  if (date.getTime() === shifted(1)) return 'Tomorrow'

  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

const FIELD_CLASS =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// One remark: its text, who wrote it and when, and - on hover - edit and
// delete. Editing happens in place rather than in a second popup, and keeps a
// date field so a note written against the wrong day can be moved to the right
// one without being retyped.
function RemarkRow({ entry, onSave, onDelete, busy }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.text)
  const [date, setDate] = useState(entry.remark_date)

  function startEditing() {
    setText(entry.text)
    setDate(entry.remark_date)
    setEditing(true)
  }

  if (editing) {
    return (
      <li className="rounded-md border border-brand-200 bg-brand-50/40 p-2">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD_CLASS} />
        <textarea
          autoFocus
          rows={3}
          maxLength={REMARKS_MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={`mt-1.5 resize-none ${FIELD_CLASS}`}
        />
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => onSave({ text: text.trim(), remarkDate: date }, () => setEditing(false))}
            className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="group/remark rounded-md px-2 py-1.5 hover:bg-slate-50">
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{entry.text}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="truncate">
          {entry.created_by_name || 'Unknown'}
          {entry.created_at ? ` · ${formatTime(entry.created_at)}` : ''}
          {entry.updated_at ? ' · edited' : ''}
        </span>
        {/* An entry the API returned without an id is the lead's pre-dated-
            remarks note, which has no stored row to address yet. It is shown
            so the history isn't hidden, and becomes editable by itself once
            the next remark is added (the server migrates it then). */}
        {entry.id && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/remark:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit remark"
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(entry.id)}
              aria-label="Delete remark"
              className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </li>
  )
}

// Staff notes cell - distinct from the read-only Query column (the student's
// own submitted text).
//
// A month calendar rather than a single text box or a plain list: the same
// lead is chased over many days, and the question being asked of this column
// is "which days did we talk to them, and what was said" - which is a shape a
// calendar answers at a glance and a text box cannot answer at all. Every day
// of the month is on screen, the ones carrying remarks are dotted, and picking
// one shows that day's notes underneath and files anything new against it.
//
// The trigger stays a single icon so the column costs what one icon costs; the
// calendar borrows space from the page, the same shape the schedule and
// inline-select cells use.
export function LeadRemarksCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const [popup, setPopup] = useState(null)
  const [selected, setSelected] = useState(todayValue())
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [draft, setDraft] = useState('')

  const entries = lead.remark_entries ?? []

  // How many remarks each day carries - the dots under the numbers, and what
  // decides whether a day is worth clicking at all.
  const countByDate = useMemo(() => {
    const counts = new Map()
    for (const entry of entries) counts.set(entry.remark_date, (counts.get(entry.remark_date) ?? 0) + 1)
    return counts
  }, [entries])

  const selectedEntries = entries.filter((entry) => entry.remark_date === selected)
  // Entries are newest-day-first from the API, so the first one is the latest
  // day anything was written about.
  const latestDate = entries[0]?.remark_date ?? null
  const cells = monthGrid(view.year, view.month)
  const today = todayValue()

  // Every remark endpoint answers with the whole lead, so the row can be
  // patched in place. Invalidating instead would refetch the page and, on a
  // slow list query, blank the calendar mid-edit.
  function applyLead(updated) {
    queryClient.setQueriesData({ queryKey: ['leads'] }, (cached) => {
      if (!cached?.items) return cached
      return { ...cached, items: cached.items.map((row) => (row.id === updated.id ? updated : row)) }
    })
  }

  function mutationFor(fn, what) {
    return {
      mutationFn: fn,
      onSuccess: (updated) => applyLead(updated),
      onError: (error) => onError?.(`Couldn't ${what} for ${lead.name}: ${getApiErrorMessage(error)}`),
    }
  }

  const add = useMutation(
    mutationFor(({ text, remarkDate }) => leadService.addRemark(lead.id, { text, remarkDate }), 'save the remark'),
  )
  const edit = useMutation(
    mutationFor(
      ({ id, text, remarkDate }) => leadService.updateRemark(lead.id, id, { text, remarkDate }),
      'update the remark',
    ),
  )
  const remove = useMutation(mutationFor((id) => leadService.deleteRemark(lead.id, id), 'delete the remark'))
  const busy = add.isPending || edit.isPending || remove.isPending

  function open(event) {
    event.stopPropagation()
    if (popup) {
      setPopup(null)
      return
    }
    // Always opens on today rather than on the last day anything was written.
    // Adding a note dated today is the common act, and starting anywhere else
    // would quietly file it against an old day; the "Latest" shortcut below
    // is how you get to the history instead.
    const now = new Date()
    setSelected(todayValue())
    setView({ year: now.getFullYear(), month: now.getMonth() })
    setDraft('')
    add.reset()
    edit.reset()
    remove.reset()
    setPopup(anchorPopup(buttonRef.current.getBoundingClientRect(), POPUP_WIDTH, POPUP_HEIGHT))
  }

  function shiftMonth(step) {
    setView((current) => {
      const date = new Date(current.year, current.month + step, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  function goTo(value) {
    const date = new Date(`${value}T00:00:00`)
    setView({ year: date.getFullYear(), month: date.getMonth() })
    setSelected(value)
  }

  function submitDraft() {
    const text = draft.trim()
    if (!text) return
    add.mutate({ text, remarkDate: selected }, { onSuccess: () => setDraft('') })
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        title={entries[0]?.text || lead.remarks || 'Add remarks'}
        aria-label={entries.length ? `Remarks for ${lead.name}` : `Add remarks for ${lead.name}`}
        className={`flex items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-slate-100 ${
          entries.length ? 'text-brand-600 hover:text-brand-700' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {entries.length > 1 && <span className="text-[11px] font-semibold">{entries.length}</span>}
      </button>

      {popup &&
        createPortal(
          <>
            {/* Click-away as its own element rather than a document listener,
                so dismissing can't also reach the row underneath and open the
                lead detail modal. */}
            <div
              className="fixed inset-0 z-40"
              onClick={(event) => {
                event.stopPropagation()
                setPopup(null)
              }}
              aria-hidden="true"
            />
            <div
              style={{ top: popup.top, left: popup.left, width: POPUP_WIDTH }}
              className="fixed z-50 flex max-h-[520px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setPopup(null)
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">
                  Remarks
                  {entries.length > 0 && <span className="ml-1.5 text-xs text-slate-400">{entries.length}</span>}
                </p>
                <button
                  type="button"
                  onClick={() => setPopup(null)}
                  aria-label="Close remarks"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              <div className="px-2.5 pb-2 pt-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">{formatMonth(view.year, view.month)}</span>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-1.5 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-slate-400">
                  {WEEKDAYS.map((label, index) => (
                    <span key={index} className="py-0.5">
                      {label}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((cell, index) => {
                    if (!cell) return <span key={`blank-${index}`} />
                    const count = countByDate.get(cell.value) ?? 0
                    const isSelected = cell.value === selected
                    const isToday = cell.value === today
                    return (
                      <button
                        key={cell.value}
                        type="button"
                        onClick={() => setSelected(cell.value)}
                        // The count goes in the label rather than only in the
                        // dot, so the marker isn't colour-only information.
                        aria-label={`${formatDayLabel(cell.value)}${count ? `, ${count} remark${count > 1 ? 's' : ''}` : ''}`}
                        aria-pressed={isSelected}
                        className={`relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs transition-colors ${
                          isSelected
                            ? 'bg-brand-600 font-semibold text-white'
                            : isToday
                              ? 'font-semibold text-brand-700 ring-1 ring-brand-300 hover:bg-brand-50'
                              : count
                                ? 'font-semibold text-slate-800 hover:bg-slate-100'
                                : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span className="leading-none">{cell.day}</span>
                        {/* The marker: a day with remarks carries a dot, so
                            which days were worked on reads off the grid
                            without opening any of them. */}
                        <span
                          className={`mt-0.5 h-1 w-1 rounded-full ${
                            count ? (isSelected ? 'bg-white' : 'bg-brand-500') : 'bg-transparent'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {formatDayLabel(selected)}
                  {selectedEntries.length > 1 && (
                    <span className="ml-1 font-normal normal-case text-slate-400">
                      · {selectedEntries.length} remarks
                    </span>
                  )}
                </span>
                {/* The history can be months back, and nothing on a calendar
                    that only shows one month says so. This jumps to it. */}
                {latestDate && latestDate !== selected && (
                  <button
                    type="button"
                    onClick={() => goTo(latestDate)}
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Latest · {formatDayLabel(latestDate)}
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
                {selectedEntries.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-slate-400">No remarks on this date.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedEntries.map((entry, index) => (
                      <RemarkRow
                        key={entry.id ?? `legacy-${index}`}
                        entry={entry}
                        busy={busy}
                        onSave={({ text, remarkDate }, done) =>
                          edit.mutate({ id: entry.id, text, remarkDate }, { onSuccess: done })
                        }
                        onDelete={(id) => remove.mutate(id)}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 p-2.5">
                <textarea
                  rows={2}
                  maxLength={REMARKS_MAX_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Add a remark for ${formatDayLabel(selected)}…`}
                  // Ctrl/Cmd+Enter saves, plain Enter is a newline: these are
                  // multi-line notes, so the modifier is the safe way round.
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submitDraft()
                  }}
                  className={`resize-none bg-white ${FIELD_CLASS}`}
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {draft.length}/{REMARKS_MAX_LENGTH}
                  </span>
                  <button
                    type="button"
                    onClick={submitDraft}
                    disabled={busy || !draft.trim()}
                    className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {add.isPending ? (
                      'Saving…'
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                        Add
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
