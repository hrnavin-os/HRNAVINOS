import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// What InductionEntry.foundation_pending_reason stores.
const MAX_REASON = 500

/**
 * Why a candidate on the Induction Leads tab hasn't moved to Foundation yet -
 * read here, and written here.
 *
 * Its own column beside Update rather than a field inside that form: it is
 * the one thing somebody chasing the stragglers reads down the list, and it
 * changes after every follow-up call.
 */
export function FoundationPendingReasonCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const mutation = useMutation({
    mutationFn: (reason) => inductionEntryService.update(entry.id, { foundation_pending_reason: reason }),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
    },
    onError: (error) => onError?.(`Couldn't save the reason for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  const reason = entry.foundation_pending_reason

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          mutation.reset()
          setEditing(true)
        }}
        title={reason || 'No reason recorded yet'}
        className={`group flex w-full max-w-64 items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm leading-snug transition-colors hover:bg-slate-50 ${
          reason ? 'text-slate-700' : 'text-slate-400'
        }`}
      >
        {/* Wraps like the quit reason does: it is a sentence, read without
            opening the row. */}
        <span className="line-clamp-3 min-w-0 flex-1">
          {mutation.isPending ? 'Saving…' : reason || 'Add a reason'}
        </span>
        <Pencil
          className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {editing && (
        <FoundationPendingReasonModal
          name={entry.name}
          defaultReason={reason}
          isSaving={mutation.isPending}
          error={mutation.isError ? getApiErrorMessage(mutation.error) : null}
          onCancel={() => setEditing(false)}
          onSave={(value) => mutation.mutate(value)}
        />
      )}
    </>
  )
}

// Mounted only while open, so each opening starts from what is stored.
function FoundationPendingReasonModal({ name, defaultReason, isSaving, error, onCancel, onSave }) {
  const [reason, setReason] = useState(defaultReason ?? '')
  const trimmed = reason.trim()
  // Emptying the box and saving clears the reason - a student whose hold-up
  // is sorted shouldn't keep showing it.
  const unchanged = trimmed === (defaultReason ?? '')

  function submit(event) {
    event.preventDefault()
    if (unchanged || isSaving) return
    onSave(trimmed)
  }

  return (
    // Stops here rather than bubbling: this renders inside a table cell, and a
    // click in the dialog would otherwise also open the row's detail popup.
    <div onClick={(event) => event.stopPropagation()}>
      <Modal
        isOpen
        onClose={onCancel}
        title={name ? `Why hasn't ${name} moved to Foundation?` : "Why haven't they moved to Foundation?"}
        maxWidth="max-w-md"
      >
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            autoFocus
            rows={4}
            label="Reason"
            value={reason}
            maxLength={MAX_REASON}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What did they say? e.g. fee pending, waiting for exam results, will join next batch…"
          />

          <ErrorMessage message={error} />

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={unchanged || isSaving}>
              {isSaving ? 'Saving…' : 'Save reason'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
