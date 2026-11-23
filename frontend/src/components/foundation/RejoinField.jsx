import { Input } from '@/components/ui/Input'
import { OLD_BATCH_RULES } from '@/utils/rejoin'

// "Is this student a rejoin?" - a checkbox, and the old batch number once it
// is ticked. One component because the Induction Call Form, the Foundation
// Form and Create Lead all ask it.
//
// The number stays registered when the box is unticked, or when a multi-page
// form moves on: unregistering it on unmount would drop the answer on the way
// to page 2. rejoinPayload is what leaves it out when it no longer applies.
export function RejoinField({ label = 'Rejoin student', checked, register, errors }) {
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          {...register('is_rejoin')}
        />
        {label}
      </label>
      {checked && (
        <Input
          label="Old Batch Number"
          required
          inputMode="numeric"
          placeholder="e.g. 30"
          autoComplete="off"
          maxLength={6}
          error={errors.rejoin_batch?.message}
          {...register('rejoin_batch', OLD_BATCH_RULES)}
        />
      )}
    </div>
  )
}
