import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'

// Anchored to the trigger and clamped to the viewport. Portaled to <body>
// because the table scrolls in both directions - a menu rendered inside the
// row would be clipped by that container, and with thirty-one options it is
// taller than the row it hangs off by a long way.
function menuPositionFor(rect, width = 288, height = 320) {
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

  const mutation = useMutation({
    mutationFn: (value) => inductionEntryService.update(entry.id, { call_remark: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't save the remark for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  const current = entry.call_remark
  const group = current ? REMARK_GROUP_BY_VALUE[current] : null

  function toggle(event) {
    event.stopPropagation()
    if (menu) {
      setMenu(null)
      return
    }
    setMenu(menuPositionFor(triggerRef.current.getBoundingClientRect()))
  }

  function choose(value) {
    setMenu(null)
    if (value !== current) mutation.mutate(value)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
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
              className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
            >
              {/* Clearing has to be reachable: a remark set by mistake could
                  otherwise never be taken off the candidate again. */}
              <button
                type="button"
                onClick={() => choose(null)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  current ? 'text-slate-600 hover:bg-slate-50' : 'bg-brand-50 font-medium text-brand-700'
                }`}
              >
                No remark
                {!current && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
              </button>

              {REMARK_GROUPS.map((item) => (
                <div key={item.key}>
                  {/* The heading is what makes thirty-one options readable -
                      you scan to the kind of outcome first, then the wording. */}
                  <p className="mt-1 flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} />
                    {item.label}
                  </p>
                  {item.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => choose(option)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                        option === current
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0">{option}</span>
                      {option === current && (
                        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
