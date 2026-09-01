import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { anchorPopup } from '@/utils/anchorPopup'

// Matches Lead.remarks' server-side cap, so an over-long paste is stopped at
// the textarea instead of coming back as an opaque 422.
const REMARKS_MAX_LENGTH = 2000

const POPUP_WIDTH = 344
const POPUP_HEIGHT = 460

// The <input type="date"> value for today, in the user's own timezone.
// toISOString() can't be used for this: it converts to UTC first, so an
// evening in IST is already tomorrow's date by the time it formats.
function todayValue() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// "2026-09-01" -> "Today" / "Yesterday" / "Tue, 1 Sep". The relative words are
// what makes a day-grouped list scannable - most of what anybody reads here is
// the last two days, and a date is slower to recognise than a word.
// The year is only shown when it isn't the current one, which keeps the
// common case short without ever being ambiguous about an old note.
function formatDayLabel(value) {
  const today = todayValue()
  if (value === today) return 'Today'

  const date = new Date(`${value}T00:00:00`)
  const yesterday = new Date(`${today}T00:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(`${today}T00:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.getTime() === yesterday.getTime()) return 'Yesterday'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

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

// Entries arrive newest-first from the API; this only groups the runs of
// equal dates, so the order the server chose is the order that shows.
function groupByDay(entries) {
  const days = []
  for (const entry of entries) {
    const last = days[days.length - 1]
    if (last && last.date === entry.remark_date) last.entries.push(entry)
    else days.push({ date: entry.remark_date, entries: [entry] })
  }
  return days
}

const FIELD_CLASS =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// One remark: its text, who wrote it and when, and - on hover - edit and
// delete. Editing happens in place rather than in a second popup, so the note
// being changed stays in the run of days it belongs to.
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
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={FIELD_CLASS}
        />
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
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/remark:opacity-100 focus-within:opacity-100">
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
// A history rather than a single text box: the same lead is chased over many
// days, and one box meant each call either overwrote the last note or was
// appended to an undated block nobody could read a sequence out of. Each note
// now carries the day it is about, and the popover reads like a calendar's
// agenda - newest day first, notes grouped under their day.
//
// The trigger stays a single icon so the column costs what one icon costs; the
// editor borrows space from the page, the same shape the schedule and
// inline-select cells use.
export function LeadRemarksCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const [popup, setPopup] = useState(null)
  const [draft, setDraft] = useState('')
  const [draftDate, setDraftDate] = useState(todayValue())

  const entries = lead.remark_entries ?? []
  const latest = entries[0]?.text || lead.remarks || ''

  // Every remark endpoint answers with the whole lead, so the row can be
  // patched in place. Invalidating instead would refetch the page and, on a
  // slow list query, blank the popover mid-edit.
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

  // A note just added is the one you want to see landed, and it belongs at the
  // top of the list, so the list is scrolled back to it rather than left
  // wherever reading history had scrolled to.
  useEffect(() => {
    if (add.isSuccess && listRef.current) listRef.current.scrollTop = 0
  }, [add.isSuccess])

  function open(event) {
    event.stopPropagation()
    if (popup) {
      setPopup(null)
      return
    }
    setDraft('')
    setDraftDate(todayValue())
    add.reset()
    edit.reset()
    remove.reset()
    setPopup(anchorPopup(buttonRef.current.getBoundingClientRect(), POPUP_WIDTH, POPUP_HEIGHT))
  }

  function submitDraft() {
    const text = draft.trim()
    if (!text) return
    add.mutate(
      { text, remarkDate: draftDate },
      {
        onSuccess: () => {
          setDraft('')
          setDraftDate(todayValue())
        },
      },
    )
  }

  const days = groupByDay(entries)

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        title={latest || 'Add remarks'}
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
              className="fixed z-50 flex max-h-[460px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
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

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {days.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-400">
                    No remarks yet. Add the first one below.
                  </p>
                ) : (
                  days.map((day) => (
                    <section key={day.date} className="mb-2 last:mb-0">
                      {/* Sticky so the day you are reading stays named while
                          scrolling through a long history. */}
                      <h4 className="sticky top-0 z-10 bg-white/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                        {formatDayLabel(day.date)}
                      </h4>
                      <ul className="space-y-1">
                        {day.entries.map((entry, index) => (
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
                    </section>
                  ))
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 p-2.5">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(event) => setDraftDate(event.target.value)}
                    aria-label="Remark date"
                    className={`${FIELD_CLASS} bg-white py-1`}
                  />
                </div>
                <textarea
                  rows={2}
                  maxLength={REMARKS_MAX_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add a remark for this date…"
                  // Ctrl/Cmd+Enter saves, plain Enter is a newline: these are
                  // multi-line notes, so the modifier is the safe way round.
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submitDraft()
                  }}
                  className={`mt-1.5 resize-none bg-white ${FIELD_CLASS}`}
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
