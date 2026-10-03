import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inductionEntryService } from '@/services/inductionEntryService'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'

// The tick itself, shared by both boards. While a save is in flight it shows
// the value being saved rather than the stored one, so the box doesn't flick
// back for the length of a round trip before the refetch lands.
function WhatsAppCheckbox({ name, checked, mutation }) {
  const shown = mutation.isPending ? mutation.variables : checked
  return (
    <input
      type="checkbox"
      checked={Boolean(shown)}
      disabled={mutation.isPending}
      onChange={(event) => mutation.mutate(event.target.checked)}
      aria-label={`${name} added to the WhatsApp group`}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-wait"
    />
  )
}

/**
 * Whether an induction candidate has been added to the WhatsApp group.
 *
 * Used to be a Yes/No on the fourth page of the Update modal, where it took
 * opening a four-step form to answer one question. Written through the same
 * details endpoint the modal uses, with only this key, so the server's
 * per-page merge leaves the rest of the page alone.
 */
export function InductionWhatsAppCell({ entry, onError }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (added) =>
      inductionEntryService.updateDetails(entry.id, { other_details: { whatsapp_group_added: added } }),
    // Refreshes the header count too: the stats live under the same key.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] }),
    onError: (error) => onError?.(`Couldn't save WhatsApp for ${entry.name}: ${getApiErrorMessage(error)}`),
  })

  return <WhatsAppCheckbox name={entry.name} checked={entry.other_details?.whatsapp_group_added} mutation={mutation} />
}

/**
 * Whether a Foundation lead has joined the WhatsApp group. Ticking it records
 * the same join the HR WhatsApp board does (group_assigned_at), so the two
 * boards can't disagree about who is in.
 */
export function LeadWhatsAppCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (added) => leadService.update(lead.id, { whatsapp_group_added: added }),
    // The header count is keyed under ['leads'] as well, so this refreshes it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) => onError?.(`Couldn't save WhatsApp for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  return <WhatsAppCheckbox name={lead.name} checked={Boolean(lead.group_assigned_at)} mutation={mutation} />
}

// The column heading, with how many of the rows under it are in the group and
// how many aren't. `counts` is { added, notAdded }, or undefined while loading.
export function WhatsAppColumnHeader({ counts }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span>WhatsApp</span>
      <span className="text-[11px] font-medium normal-case tracking-normal">
        <span className="text-emerald-600">{counts ? counts.added : '–'} added</span>
        <span className="text-slate-400"> · </span>
        <span className="text-amber-600">{counts ? counts.notAdded : '–'} not added</span>
      </span>
    </div>
  )
}
