import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'
import { REMARK_GROUPS, REMARK_GROUP_BY_VALUE } from '@/constants/inductionCallRemarks'

// What the column stores, and so what can be typed into it.
const MAX_REMARK = 100

export function InductionCallRemarkCell({ entry, onError }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (value) => inductionEntryService.update(entry.id, { call_remark: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't save the remark for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  const current = entry.call_remark
  const group = current ? REMARK_GROUP_BY_VALUE[current] : null

  return (
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
      onSave={(value) => mutation.mutate(value)}
    />
  )
}
