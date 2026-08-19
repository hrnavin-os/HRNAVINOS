import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'

// What the column stores, and so what can be typed into it.
const MAX_CATEGORY = 150

/**
 * Where a candidate is coming from - Fresher, Career Gap, Pursuing Student -
 * set from the board rather than only through the edit form.
 *
 * It is the field most often corrected after the induction call, and reaching
 * it meant opening a nine-field modal for one value. A Section Admin can set
 * it for the same reason they can set the call remark: they hold
 * leads.update, they are the one on the call, and their scope already limits
 * the rows they can see to their own section.
 */
export function InductionCategoryCell({ entry, options, onError }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (value) => inductionEntryService.update(entry.id, { category: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't save the category for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  return (
    <InlineSelectCell
      value={entry.category}
      // One flat list, no colours: a category is not an outcome with a good or
      // bad direction, and six tints across a column of them would be a colour
      // wheel carrying nothing.
      groups={[{ key: 'category', options }]}
      badgeClass="border-emerald-200 bg-emerald-50 text-emerald-700"
      placeholder="Set category"
      clearLabel="No category"
      searchLabel="Search or type a category"
      maxLength={MAX_CATEGORY}
      isSaving={mutation.isPending}
      onSave={(value) => mutation.mutate(value)}
    />
  )
}
