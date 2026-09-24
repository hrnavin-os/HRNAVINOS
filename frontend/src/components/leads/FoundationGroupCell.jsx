import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage } from '@/services/apiClient'
import { inductionEntryService } from '@/services/inductionEntryService'
import { leadService } from '@/services/leadService'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'
import {
  foundationGroupLabel,
  foundationGroupTone,
  foundationGroupValue,
} from '@/constants/foundationGroups'

// The trigger wears the colour of the group it holds, the same hue the
// read-only badge uses, so a column of cells and a column of badges on the
// next board over read as the same fact.
const TRIGGER_CLASS = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  teal: 'border-teal-200 bg-teal-50 text-teal-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
}

/**
 * Which foundation class a student is in, changed from the table.
 *
 * Editable because the group is a decision, not a reading of a date: classes
 * fill up, students ask to switch, and somebody has to be able to say so
 * without a developer. Reaching it through the edit form would mean opening a
 * nine-field modal to change one dropdown, on the board where the whole
 * column is in front of you.
 *
 * Typing a group the list doesn't offer is deliberately off. The boards filter
 * and count on this, and the API reads the answer as a number - "Morning" is
 * refused on submit, so offering to type it would be offering to fail. The
 * list itself is open: it comes from the Induction Call Form's Group field, so
 * adding a fourth class in Admin > Form Collection puts it here too.
 *
 * A change is always saved as direct - the board no longer asks whether the
 * student was "moved from" another group, nor shows a note saying so.
 *
 * `onSave` takes the number and whether it was direct, so the two boards can send it under whichever
 * name their own API uses.
 */
export function FoundationGroupCell({ row, options, onSave, isSaving = false }) {
  return (
    <div className="inline-flex flex-col items-stretch">
      <InlineSelectCell
        value={foundationGroupLabel(row.foundation_group)}
        groups={[{ key: 'groups', options }]}
        allowCustom={false}
        badgeClass={TRIGGER_CLASS[foundationGroupTone(row.foundation_group)]}
        placeholder="Set group"
        clearLabel="No group"
        searchLabel="Search groups"
        isSaving={isSaving}
        onSave={(label) => onSave(foundationGroupValue(label), true)}
      />
    </div>
  )
}

/**
 * The cell on the Induction board, saving through the entry's own endpoint.
 *
 * Two thin wrappers rather than one cell taking a service, because the two
 * differ in more than the URL: the failure message names a different kind of
 * record, and each invalidates its own board's query key.
 */
export function InductionGroupCell({ entry, options, onError }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ foundation_group, direct }) =>
      inductionEntryService.update(entry.id, {
        foundation_group,
        foundation_group_direct: direct,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't change the group for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  return (
    <FoundationGroupCell
      row={entry}
      options={options}
      isSaving={mutation.isPending}
      onSave={(group, direct) => mutation.mutate({ foundation_group: group, direct })}
    />
  )
}

/** The same cell on the Foundation board, saving through the lead's endpoint. */
export function LeadGroupCell({ lead, options, onError }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ foundation_group, direct }) =>
      leadService.update(lead.id, { foundation_group, foundation_group_direct: direct }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) => onError?.(`Couldn't change the group for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  return (
    <FoundationGroupCell
      row={lead}
      options={options}
      isSaving={mutation.isPending}
      onSave={(group, direct) => mutation.mutate({ foundation_group: group, direct })}
    />
  )
}
