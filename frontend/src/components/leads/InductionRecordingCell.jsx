import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Video } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { anchorPopup } from '@/utils/anchorPopup'
import { Button } from '@/components/ui/Button'
import { MEDIA_BASE_URL } from '@/constants/config'

const POPUP_WIDTH = 300
const POPUP_HEIGHT = 190

const isAbsolute = (value) => /^https?:\/\//i.test(value)

// Recordings uploaded before this became a Drive link are stored as a server
// path, so they still open through the media host. Anything absolute is a
// link someone pasted and is used as given.
function recordingHref(value) {
  if (!value) return null
  return isAbsolute(value) ? value : `${MEDIA_BASE_URL}${value}`
}

/**
 * The induction call's screen recording, as a Drive link - opened and set from
 * the board.
 *
 * Used to be the last field on the fourth page of the Update modal, so checking
 * whether a call had been recorded meant opening a four-step form per row. Same
 * popover shape as the schedule cell: the cell costs what the value costs to
 * show, and the input borrows space from the page while it is being typed in.
 */
export function InductionRecordingCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const [popup, setPopup] = useState(null)

  const stored = entry.other_details?.call_recording_url ?? ''
  const [link, setLink] = useState(stored)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (popup) inputRef.current?.select()
  }, [popup])

  const mutation = useMutation({
    mutationFn: (value) =>
      inductionEntryService.updateDetails(entry.id, {
        // Only this key. The server merges each page with exclude_unset, so the
        // rest of other_details stays exactly as the Update form and the other
        // columns set it.
        other_details: { call_recording_url: value },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
      setPopup(null)
    },
    onError: (error) =>
      onError?.(`Couldn't save the recording for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  function open(event) {
    event.stopPropagation()
    if (popup) {
      setPopup(null)
      return
    }
    // Seeded from what is stored at open time, so a row changed underneath
    // starts from the current value rather than whatever was typed before.
    setLink(stored)
    setInvalid(false)
    mutation.reset()
    setPopup(anchorPopup(triggerRef.current.getBoundingClientRect(), POPUP_WIDTH, POPUP_HEIGHT))
  }

  function save() {
    const value = link.trim()
    // An old upload's server path is let through untouched - it is what is
    // already stored, not something typed. A new value has to be a whole link,
    // or the Open button would point somewhere relative to this app.
    if (value && value !== stored && !isAbsolute(value)) {
      setInvalid(true)
      return
    }
    // Empty clears the link rather than storing "".
    mutation.mutate(value || null)
  }

  const href = recordingHref(stored)

  return (
    <>
      <div className="flex items-center gap-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <Video className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            Open
            <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
        <button
          ref={triggerRef}
          type="button"
          onClick={open}
          aria-label={href ? `Change the recording link for ${entry.name}` : `Add the recording link for ${entry.name}`}
          title={href ? 'Change link' : undefined}
          className="group/recording inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm transition-colors hover:bg-slate-100"
        >
          {href ? (
            <Pencil
              className="h-3 w-3 text-slate-300 transition-colors group-hover/recording:text-slate-500"
              strokeWidth={2}
              aria-hidden="true"
            />
          ) : (
            <>
              <Video className="h-3.5 w-3.5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden="true" />
              <span className="text-slate-400 group-hover/recording:text-slate-600">Add link</span>
            </>
          )}
        </button>
      </div>

      {popup &&
        createPortal(
          <>
            {/* Click-away. Its own element rather than a document listener, so
                dismissing cannot also reach the row underneath and open the
                detail popup. */}
            <div
              className="fixed inset-0 z-40"
              onClick={(event) => {
                event.stopPropagation()
                setPopup(null)
              }}
              aria-hidden="true"
            />
            <div
              style={{ top: popup.top, bottom: popup.bottom, left: popup.left, width: POPUP_WIDTH }}
              className="fixed z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setPopup(null)
                if (event.key === 'Enter') save()
              }}
            >
              <label className="block text-xs font-medium text-slate-600">
                Induction Call Screen Recording
                <input
                  ref={inputRef}
                  type="url"
                  value={link}
                  placeholder="https://drive.google.com/..."
                  onChange={(event) => {
                    setLink(event.target.value)
                    setInvalid(false)
                  }}
                  className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 ${
                    invalid
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                      : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'
                  }`}
                />
              </label>
              <p className={`mt-1 text-xs ${invalid ? 'text-red-600' : 'text-slate-500'}`}>
                {invalid
                  ? 'Paste the full link, starting with https://'
                  : 'Paste the Drive link. Make sure anyone with the link can view it.'}
              </p>

              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
                <Button
                  variant="ghost"
                  className="px-2! py-1! text-xs"
                  onClick={() => setPopup(null)}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button className="px-2.5! py-1! text-xs" onClick={save} disabled={mutation.isPending}>
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
