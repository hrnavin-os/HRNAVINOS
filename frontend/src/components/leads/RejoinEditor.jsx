import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { RejoinField } from '@/components/foundation/RejoinField'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { rejoinPayload } from '@/utils/rejoin'

// The Foundation lead popup's rejoin correction: a lead's other form answers
// have no edit form, and a box ticked by mistake on the public form would
// otherwise put a chip on the board that nobody could take off.
export function RejoinEditor({ lead, onSaved }) {
  const [isOpen, setIsOpen] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm()

  const mutation = useMutation({
    mutationFn: (values) => leadService.update(lead.id, rejoinPayload(values)),
    onSuccess: (updatedLead) => {
      onSaved(updatedLead)
      setIsOpen(false)
    },
  })

  function open() {
    reset({ is_rejoin: Boolean(lead.rejoin_batch), rejoin_batch: lead.rejoin_batch ?? '' })
    mutation.reset()
    setIsOpen(true)
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        {lead.rejoin_batch ? 'Edit rejoin' : 'Mark as rejoin'}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-3">
      <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />
      <RejoinField checked={watch('is_rejoin')} register={register} errors={errors} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
