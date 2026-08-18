import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Search } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import {
  REMARK_GROUPS,
  REMARK_GROUP_BY_VALUE,
  isKnownRemark,
  remarkMatches,
} from '@/constants/inductionCallRemarks'

// What the column stores, and so what can be typed into it.
const MAX_REMARK = 100

// Anchored to the trigger and clamped to the viewport. Portaled to <body>
// because the table scrolls in both directions - a menu rendered inside the
// row would be clipped by that container, and the list is taller than the row
// it hangs off by a long way.
function menuPositionFor(rect, width = 320, height = 340) {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  // Flips above the trigger when there isn't room below, so a row near the
  // bottom of the page doesn't open a menu you have to scroll to see.
  const openUp = rect.bottom + height > window.innerHeight && rect.top > height
  return { left, top: openUp ? Math.max(8, rect.top - height - 4) : rect.bottom + 4 }
}

export function InductionCallRemarkCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const triggerRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [query, setQuery] = useState('')

  const mutation = useMutation({
    mutationFn: (value) => inductionEntryService.update(entry.id, { call_remark: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't save the remark for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  const current = entry.call_remark
  const group = current ? REMARK_GROUP_BY_VALUE[current] : null

  // Groups keep their order so the colours run in a predictable sequence, and
  // an emptied group drops out rather than leaving a gap while filtering.
  const groups = useMemo(
    () =>
      REMARK_GROUPS.map((item) => ({
        ...item,
        options: item.options.filter((option) => remarkMatches(option, query)),
      })).filter((item) => item.options.length),
    [query],
  )
  const typed = query.trim().slice(0, MAX_REMARK)
  // Anything the list doesn't cover can still be written down. The dropdown is
  // the shortcut, not the whole vocabulary - a caller who needs to say
  // something else shouldn't have to leave the cell blank.
  const custom = typed && !isKnownRemark(typed) ? typed : null
  const first = groups[0]?.options[0] ?? custom

  function open(event) {
    event.stopPropagation()
    if (menu) {
      setMenu(null)
      return
    }
    setQuery('')
    setMenu(menuPositionFor(triggerRef.current.getBoundingClientRect()))
  }

  function choose(value) {
    setMenu(null)
    setQuery('')
    if (value !== current) mutation.mutate(value)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') setMenu(null)
    // Type enough to leave one candidate, press Enter, move on - the whole
    // point of the search box for someone working down a column of rows.
    if (event.key === 'Enter' && first) choose(first)
  }

  const row = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        disabled={mutation.isPending}
        title={current ?? 'Set induction call remark'}
        className={`inline-flex w-full max-w-52 items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-left text-xs font-medium transition-colors disabled:cursor-wait ${
          group ? group.badge : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400'
        }`}
      >
        <span className="truncate">{mutation.isPending ? 'Saving…' : (current ?? 'Set remark')}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={2} aria-hidden="true" />
      </button>

      {menu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div
              style={{ top: menu.top, left: menu.left }}
              className="fixed z-50 flex max-h-[21rem] w-80 flex-col rounded-lg border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  maxLength={MAX_REMARK}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search or type a remark"
                  className="w-full border-0 p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                />
              </div>

              <div className="overflow-y-auto p-1">
                {/* Clearing has to be reachable: a remark set by mistake could
                    otherwise never be taken off the candidate again. */}
                {!query && (
                  <button
                    type="button"
                    onClick={() => choose(null)}
                    className={`${row} justify-between ${
                      current ? 'text-slate-600 hover:bg-slate-50' : 'bg-brand-50 font-medium text-brand-700'
                    }`}
                  >
                    No remark
                    {!current && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                )}

                {groups.map((item) => (
                  // A gap and the colour are the whole separation. A heading
                  // said out loud what the dot already says, and cost a line
                  // of the menu each time it did.
                  <div key={item.key} className="mt-1 first:mt-0">
                    {item.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => choose(option)}
                        className={`${row} ${
                          option === current ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'
                        } ${item.text}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">{option}</span>
                        {option === current && (
                          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                ))}

                {custom && (
                  <button
                    type="button"
                    onClick={() => choose(custom)}
                    className={`${row} mt-1 border-t border-slate-100 pt-2 text-slate-600 hover:bg-slate-50`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full border border-dashed border-slate-400"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      Use “<span className="font-medium text-slate-800">{custom}</span>”
                    </span>
                  </button>
                )}

                {!groups.length && !custom && (
                  <p className="px-2.5 py-3 text-sm text-slate-400">No remark matches that.</p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
