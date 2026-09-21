import { useEffect, useState } from 'react'
import { UserX } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// What InductionEntry.quit_reason stores.
const MAX_REASON = 500

/**
 * Asks why a candidate quit, before the quit remark is recorded.
 *
 * Quit is the only disposition on the board that ends the candidate's journey,
 * and the one the Quit Students tab is read from - "Quit - Before Induction
 * Call" says when it happened and nothing about why, which is the part anyone
 * reviewing drop-offs actually needs. So the remark isn't saved on its own:
 * picking a quit option opens this, and the two are written together.
 */
export function QuitReasonModal({ isOpen, name, remark, defaultReason, isSaving, error, onCancel, onSave }) {
  const [reason, setReason] = useState('')

  // Reset on each opening rather than on every render, so a half-typed reason
  // survives the dialog being re-rendered underneath it but never carries over
  // from the last row that was marked.
  useEffect(() => {
    if (isOpen) setReason(defaultReason ?? '')
  }, [isOpen, defaultReason])

  const trimmed = reason.trim()

  function submit(event) {
    event.preventDefault()
    if (!trimmed || isSaving) return
    onSave(trimmed)
  }

  return (
    // Stops here rather than bubbling: this renders inside a table cell, and a
    // click anywhere in the dialog would otherwise also reach the row and open
    // its detail popup behind the backdrop.
    <div onClick={(event) => event.stopPropagation()}>
      <Modal
        isOpen={isOpen}
        onClose={onCancel}
        title={name ? `Why did ${name} quit?` : 'Why did they quit?'}
        maxWidth="max-w-md"
      >
        <form onSubmit={submit} className="space-y-3">
          {/* The remark being recorded, shown rather than assumed: the dialog
              opens a click after it was chosen from a list of nineteen. */}
          <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-600 text-white">
              <UserX className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-red-700/70">Remark</p>
              <p className="break-words text-sm font-semibold leading-tight text-red-800">{remark}</p>
            </div>
          </div>

          <Textarea
            autoFocus
            required
            rows={4}
            label="Reason"
            value={reason}
            maxLength={MAX_REASON}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What did they say? e.g. joined another institute, fee not affordable, relocating…"
          />

          <ErrorMessage message={error} />

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            {/* Disabled until something is written: an empty reason is the one
                thing this dialog exists to prevent, and the server refuses it
                anyway. */}
            <Button type="submit" variant="danger" disabled={!trimmed || isSaving}>
              {isSaving ? 'Saving…' : 'Save remark'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
