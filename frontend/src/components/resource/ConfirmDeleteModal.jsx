import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Confirmation step in front of every destructive row action. Deletes are
// permanent server-side (no soft-delete flag on these collections), so the
// record being removed is spelled out rather than just "this item".
export function ConfirmDeleteModal({ title = 'Confirm Delete', describe, error, isPending, onConfirm, onClose }) {
  return (
    <Modal title={title} isOpen onClose={onClose} maxWidth="max-w-md">
      <ErrorMessage message={error} />
      <p className="text-sm text-slate-700">
        Delete <span className="font-medium text-slate-900">{describe}</span>?
      </p>
      <p className="mt-1.5 text-sm text-slate-500">This action cannot be undone.</p>
      <div className="flex justify-end gap-2 pt-5">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={isPending}>
          {isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  )
}
