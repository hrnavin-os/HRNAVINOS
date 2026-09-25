import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { settingsService } from '@/services/settingsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

/**
 * The Super Admin's switch for the Admin role's delete option on every
 * Induction and Foundation lead. The server grants or withholds leads.delete
 * from it, so the boards' existing delete buttons simply appear or don't.
 * Super Admin keeps delete either way.
 */
export function LeadDeleteToggleCard() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['settings', 'lead-delete'],
    queryFn: settingsService.getLeadDelete,
  })
  const mutation = useMutation({
    mutationFn: settingsService.setLeadDelete,
    onSuccess: (updated) => queryClient.setQueryData(['settings', 'lead-delete'], updated),
  })

  const enabled = mutation.isPending ? mutation.variables : Boolean(data?.enabled)

  return (
    <section className="mt-6 max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden="true" />
          <div>
            <h2 id="lead-delete-label" className="text-sm font-semibold text-slate-900">
              Admin can delete leads
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Shows a delete option on every lead on the Induction and Foundation boards for the Admin
              role. Section Admins never get it; Super Admin always has it.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              An Admin who is already signed in sees the change after reloading the page.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="lead-delete-label"
          disabled={isLoading || mutation.isPending}
          onClick={() => mutation.mutate(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
            enabled ? 'bg-brand-600' : 'bg-slate-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <ErrorMessage
        message={
          error ? getApiErrorMessage(error) : mutation.error ? getApiErrorMessage(mutation.error) : null
        }
      />
    </section>
  )
}
