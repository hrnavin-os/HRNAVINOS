import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { FIELD } from '@/components/ui/Input'

// Confirmation step in front of every destructive row action.
//
// `requireReason` turns it into a short form: the record is removed *and* the
// removal is accounted for. Used where a deleted record is kept and listed
// afterwards (users, roles) - a Deleted tab whose rows carry no reason is a
// list of decisions nobody can explain a month later, and the moment of
// deletion is the only moment anybody knows why.
export function ConfirmDeleteModal({
  title = 'Confirm Delete',
  describe,
  error,
  isPending,
  onConfirm,
  onClose,
  requireReason = false,
  reasonLabel = 'Reason for deleting',
  // What happens to the record. The default is the permanent case; callers
  // that keep the record say so, since "cannot be undone" is not true there
  // and a warning nobody believes is worse than none.
  consequence = 'This action cannot be undone.',
}) {
  const [reason, setReason] = useState('')
  const canDelete = !requireReason || reason.trim().length >= 3

  return (
    <Modal title={title} isOpen onClose={onClose} maxWidth="max-w-md">
      <ErrorMessage message={error} />
      <p className="text-sm text-slate-700">
        Delete <span className="font-medium text-slate-900">{describe}</span>?
      </p>
      <p className="mt-1.5 text-sm text-slate-500">{consequence}</p>

      {requireReason && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {reasonLabel} <span className="text-red-500">*</span>
          </span>
          <textarea
            autoFocus
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Left the company on 30 Aug"
            className={`${FIELD} resize-none py-2`}
          />
        </label>
      )}

      <div className="flex justify-end gap-2 pt-5">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => onConfirm(reason.trim())}
          disabled={isPending || !canDelete}
        >
          {isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  )
}
