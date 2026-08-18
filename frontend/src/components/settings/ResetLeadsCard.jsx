import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { settingsService } from '@/services/settingsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// The server requires this exact string. Typing it is not the security - that
// is the Super Admin role check and the server-side comparison - it is here so
// the action cannot be reached by a reflex click on a button somebody was only
// reading.
const CONFIRMATION = 'DELETE ALL LEADS'

// Clears the Foundation lead pipeline. Its own bordered card, apart from the
// settings form, because it is not a setting: the form saves values, this
// destroys records, and a destructive control sitting at the end of a row of
// text inputs is one somebody eventually presses by accident.
export function ResetLeadsCard() {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)

  const mutation = useMutation({
    mutationFn: () => settingsService.resetLeads(typed),
    onSuccess: (counts) => {
      // Every board that reads leads is now stale. Invalidating everything is
      // easier to reason about than listing the keys and missing one.
      queryClient.invalidateQueries()
      setResult(counts)
      setIsOpen(false)
      setTyped('')
    },
  })

  function close() {
    if (mutation.isPending) return
    setIsOpen(false)
    setTyped('')
    mutation.reset()
  }

  return (
    <>
      <section className="mt-6 max-w-xl overflow-hidden rounded-lg border border-red-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50/60 px-6 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" strokeWidth={2} aria-hidden="true" />
          <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Reset leads</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Removes every lead from the Foundation board, along with their batch allocations. Induction
              entries are kept and returned to the Induction board, so no call record is lost.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Students, admissions and invoices are <span className="font-medium">not</span> touched — people
              who already enrolled stay enrolled.
            </p>
          </div>

          {result && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Reset complete: {result.leads_deleted} lead{result.leads_deleted === 1 ? '' : 's'} removed,{' '}
              {result.allocations_deleted} allocation{result.allocations_deleted === 1 ? '' : 's'} removed,{' '}
              {result.induction_entries_unlinked} induction entr
              {result.induction_entries_unlinked === 1 ? 'y' : 'ies'} returned to the board.
            </p>
          )}

          <Button variant="danger" onClick={() => setIsOpen(true)}>
            <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Reset all leads
          </Button>
        </div>
      </section>

      <Modal title="Reset all leads" isOpen={isOpen} onClose={close}>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            This clears the Foundation board for everyone. It cannot be undone from the app.
          </p>

          <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

          <Input
            label={`Type ${CONFIRMATION} to confirm`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={CONFIRMATION}
            autoComplete="off"
          />

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={close} disabled={mutation.isPending}>
              Cancel
            </Button>
            {/* Disabled until the phrase matches exactly, so the confirm button
                cannot be reached by clicking straight through the dialog. */}
            <Button
              variant="danger"
              onClick={() => mutation.mutate()}
              disabled={typed !== CONFIRMATION || mutation.isPending}
            >
              {mutation.isPending ? 'Resetting…' : 'Reset all leads'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
