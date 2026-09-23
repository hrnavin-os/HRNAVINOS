import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorMessage } from '@/services/apiClient'
import { inductionEntryService } from '@/services/inductionEntryService'
import { leadService } from '@/services/leadService'
import { InlineSelectCell } from '@/components/leads/InlineSelectCell'
import {
  foundationGroupLabel,
  foundationGroupTone,
  foundationGroupValue,
  lastGroupMove,
} from '@/constants/foundationGroups'
import { formatDateTime } from '@/utils/formatters'

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
 * Changing a set group to another asks one more thing: whether the student
 * was moved there (the board then says "moved from Group 1") or belongs there
 * directly (it says nothing).
 *
 * `onSave` takes the number and whether it was direct, so the two boards can send it under whichever
 * name their own API uses.
 */
export function FoundationGroupCell({ row, options, onSave, isSaving = false }) {
  const moved = lastGroupMove(row.foundation_group_history)

  return (
    <div className="inline-flex flex-col items-stretch gap-0.5">
      <InlineSelectCell
        value={foundationGroupLabel(row.foundation_group)}
        groups={[{ key: 'groups', options }]}
        allowCustom={false}
        badgeClass={TRIGGER_CLASS[foundationGroupTone(row.foundation_group)]}
        placeholder="Set group"
        clearLabel="No group"
        searchLabel="Search groups"
        isSaving={isSaving}
        confirmChoice={(label) => {
          // Only a change from one group to another is ambiguous. Setting a
          // group for the first time, or clearing one, is just that.
          const from = row.foundation_group
          const to = foundationGroupValue(label)
          if (!from || !to || from === to) return null
          const fromLabel = foundationGroupLabel(from)
          return {
            title: `${fromLabel} → ${label}`,
            choices: [
              { key: 'direct', label: `Direct ${label}`, hint: 'Belongs in this group outright - no "moved from" note' },
              { key: 'moved', label: `Moved from ${fromLabel}`, hint: `Shows "moved from ${fromLabel}" under the group` },
            ],
          }
        }}
        onSave={(label, how) => onSave(foundationGroupValue(label), how === 'direct')}
      />
      {/* Under the control rather than inside it: the dropdown says where the
          student is now, and this says how they got there. A move is the whole
          reason the column had to become editable, so the board has to admit
          to one rather than quietly showing the new value. */}
      {moved && (
        <span
          className="text-[11px] leading-tight text-amber-600"
          title={`Moved by ${moved.by_name ?? 'someone'} on ${formatDateTime(moved.at)}`}
        >
          moved from {foundationGroupLabel(moved.from_group)}
        </span>
      )}
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
