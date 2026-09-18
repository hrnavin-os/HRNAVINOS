import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { settingsService } from '@/services/settingsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

/**
 * The three resets, one per board and one for both.
 *
 * Separate actions because the boards are separate populations: a bad import
 * into Induction is not a reason to wipe the Foundation pipeline, and somebody
 * clearing out a season of Foundation leads has no business touching the
 * induction calls that are still being made.
 *
 * Each carries its own phrase, and each phrase names its own board. The server
 * checks the phrase against the scope it was sent with, so the failure this
 * guards against - clicking the wrong one of three buttons a few pixels apart
 * and then typing the words the dialog asked for - cannot be carried out. A
 * single shared phrase would have made that mistake succeed.
 */
const RESETS = [
  {
    scope: 'induction',
    title: 'Reset Induction board',
    button: 'Reset induction leads',
    phrase: 'DELETE INDUCTION LEADS',
    describe: () => (
      <>
        Removes every entry from the Induction board — pending calls and ones already moved to
        Foundation alike.
      </>
    ),
    warn: 'This clears the Induction board for everyone. Foundation leads stay where they are.',
  },
  {
    scope: 'foundation',
    title: 'Reset Foundation board',
    button: 'Reset foundation leads',
    phrase: 'DELETE FOUNDATION LEADS',
    describe: () => (
      <>
        Removes every lead from the Foundation board, along with their batch allocations. Induction
        entries that had moved to Foundation come back to the Induction board.
      </>
    ),
    warn: 'This clears the Foundation board for everyone. The Induction board stays, and anyone who had moved across returns to it.',
  },
  {
    scope: 'all',
    title: 'Reset both boards',
    button: 'Reset all leads',
    phrase: 'DELETE ALL LEADS',
    describe: () => (
      <>
        Removes every lead from both the Induction board and the Foundation board, along with their
        batch allocations.
      </>
    ),
    warn: 'This clears the Induction and Foundation boards for everyone. It cannot be undone from the app.',
  },
]

// What a finished reset actually touched, in a sentence. Built from the counts
// the server returns rather than from the scope that was asked for: the point
// of printing it is to say what happened, and a line assembled from the
// request would say the same thing whether anything was deleted or not.
function summarise(counts) {
  const parts = []
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  if (counts.induction_entries_deleted) {
    parts.push(plural(counts.induction_entries_deleted, 'induction entry', 'induction entries'))
  }
  if (counts.leads_deleted) parts.push(plural(counts.leads_deleted, 'foundation lead', 'foundation leads'))
  if (counts.allocations_deleted) {
    parts.push(plural(counts.allocations_deleted, 'allocation', 'allocations'))
  }

  const removed = parts.length ? `${parts.join(', ')} removed` : 'nothing to remove'
  // The repair, said out loud. Entries coming back onto a board somebody just
  // cleared looks like a bug unless it was announced.
  const returned = counts.induction_links_cleared
    ? `, and ${plural(counts.induction_links_cleared, 'entry', 'entries')} returned to the Induction board`
    : ''
  return `Reset complete: ${removed}${returned}.`
}

// Clears the lead pipelines. Its own bordered card, apart from the settings
// form, because it is not a setting: the form saves values, this destroys
// records, and a destructive control sitting at the end of a row of text
// inputs is one somebody eventually presses by accident.
export function ResetLeadsCard() {
  const queryClient = useQueryClient()
  // Which reset is being confirmed, or null for none. One dialog rather than
  // three: only one can be open, and three copies of the same form is three
  // places for the confirmation check to drift apart.
  const [pending, setPending] = useState(null)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)

  const mutation = useMutation({
    mutationFn: () => settingsService.resetLeads(typed, pending.scope),
    onSuccess: (counts) => {
      // Every board that reads leads is now stale. Invalidating everything is
      // easier to reason about than listing the keys and missing one.
      queryClient.invalidateQueries()
      setResult(counts)
      setPending(null)
      setTyped('')
    },
  })

  function open(reset) {
    // The last run's summary belongs to the last run; leaving it up beside a
    // new dialog reads as the new one having already happened.
    setResult(null)
    setPending(reset)
    setTyped('')
    mutation.reset()
  }

  function close() {
    if (mutation.isPending) return
    setPending(null)
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

        <div className="p-6">
          <p className="text-sm leading-relaxed text-slate-600">
            Students, admissions and invoices are <span className="font-medium">not</span> touched by any
            of these — people who already enrolled stay enrolled.
          </p>

          {result && (
            <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {summarise(result)}
            </p>
          )}

          {/* Divided rather than spaced: three destructive buttons in one card
              need a visible line between them, so it is never ambiguous which
              description a button belongs to. */}
          <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
            {RESETS.map((reset) => (
              <div key={reset.scope} className="py-4">
                <h3 className="text-sm font-semibold text-slate-900">{reset.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{reset.describe()}</p>
                <Button variant="danger" className="mt-3" onClick={() => open(reset)}>
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {reset.button}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Modal title={pending?.title ?? ''} isOpen={pending !== null} onClose={close}>
        {pending && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">{pending.warn}</p>

            <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

            <Input
              label={`Type ${pending.phrase} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={pending.phrase}
              autoComplete="off"
            />

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={close} disabled={mutation.isPending}>
                Cancel
              </Button>
              {/* Disabled until the phrase matches exactly, so the confirm
                  button cannot be reached by clicking straight through the
                  dialog. */}
              <Button
                variant="danger"
                onClick={() => mutation.mutate()}
                disabled={typed !== pending.phrase || mutation.isPending}
              >
                {mutation.isPending ? 'Resetting…' : pending.button}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
