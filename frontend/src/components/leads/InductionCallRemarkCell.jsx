import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'
import { QuitReasonModal } from '@/components/leads/QuitReasonModal'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE, isQuitRemark } from '@/constants/inductionCallRemarks'

// What the column stores, and so what can be typed into it.
const MAX_REMARK = 100

export function InductionCallRemarkCell({ entry, onError }) {
  const queryClient = useQueryClient()
  // The quit remark waiting on a reason. Held here rather than saved
  // optimistically: until the reason is given nothing has been recorded, so
  // cancelling the dialog has to leave the row exactly as it was.
  const [asking, setAsking] = useState(null)

  const mutation = useMutation({
    mutationFn: (payload) => inductionEntryService.update(entry.id, payload),
    onSuccess: () => {
      setAsking(null)
      queryClient.invalidateQueries({ queryKey: ['induction-entries'] })
    },
    onError: (error) => onError?.(`Couldn't save the remark for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  const current = entry.call_remark
  const group = current ? REMARK_GROUP_BY_VALUE[current] : null

  // Quit is the one disposition that has to say why, so picking one opens the
  // dialog instead of saving: the two are written together, and the server
  // refuses the remark on its own anyway. Every other remark saves on click,
  // which is the whole point of an inline cell.
  function save(value) {
    if (isQuitRemark(value)) {
      setAsking(value)
      return
    }
    mutation.mutate({ call_remark: value })
  }

  return (
    <>
      <InlineSelectCell
        value={current}
        // The six outcome groups, each carrying its own colour. No headings: the
        // dot on every row says which outcome it belongs to in no vertical
        // space, and nineteen options need the space.
        groups={REMARK_GROUPS}
        badgeClass={group?.badge}
        placeholder="Set remark"
        clearLabel="No remark"
        searchLabel="Search or type a remark"
        maxLength={MAX_REMARK}
        isSaving={mutation.isPending}
        onSave={save}
      />

      <QuitReasonModal
        isOpen={Boolean(asking)}
        name={entry.name}
        remark={asking}
        // Only prefilled when the remark isn't changing - the stored reason
        // explains the remark it was written against, not a different one.
        defaultReason={asking === current ? entry.quit_reason : ''}
        isSaving={mutation.isPending}
        // Repeated inside the dialog as well as on the board's toast: the
        // toast sits behind the backdrop, so a refusal reported only there
        // would look like nothing happened at all.
        error={mutation.isError ? getApiErrorMessage(mutation.error) : null}
        onCancel={() => setAsking(null)}
        onSave={(reason) => mutation.mutate({ call_remark: asking, quit_reason: reason })}
      />
    </>
  )
}
