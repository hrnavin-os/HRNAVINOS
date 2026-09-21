import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { QuitReasonModal } from '@/components/leads/QuitReasonModal'

/**
 * The Quit tab's reason column - read here, and rewritten here.
 *
 * Entries that quit before the reason was asked for have none, and this is
 * where they get one: the alternative was re-picking a remark the row already
 * carries, just to be asked the question again.
 */
export function InductionQuitReasonCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const mutation = useMutation({
    mutationFn: (reason) => inductionEntryService.update(entry.id, { quit_reason: reason }),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
    },
    onError: (error) => onError?.(`Couldn't save the reason for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setEditing(true)
        }}
        title={entry.quit_reason || 'No reason recorded yet'}
        className={`group flex w-full max-w-64 items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm leading-snug transition-colors hover:bg-slate-50 ${
          entry.quit_reason ? 'text-slate-700' : 'font-medium text-red-600'
        }`}
      >
        {/* Wraps rather than truncating: the reason is a sentence, and the
            whole point of the column is to read it without opening the row.
            Three lines is where a long one stops stretching its neighbours. */}
        <span className="line-clamp-3 min-w-0 flex-1">
          {mutation.isPending ? 'Saving…' : entry.quit_reason || 'Add a reason'}
        </span>
        <Pencil
          className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      <QuitReasonModal
        isOpen={editing}
        name={entry.name}
        remark={entry.call_remark}
        defaultReason={entry.quit_reason}
        isSaving={mutation.isPending}
        error={mutation.isError ? getApiErrorMessage(mutation.error) : null}
        onCancel={() => setEditing(false)}
        onSave={(reason) => mutation.mutate(reason)}
      />
    </>
  )
}
