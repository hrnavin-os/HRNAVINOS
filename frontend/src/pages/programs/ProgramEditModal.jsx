import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PricingCategoryFields } from '@/components/foundation/PricingCategoryFields'
import { programService } from '@/services/programService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

/**
 * Everything a program is, in one form.
 *
 * The program document itself holds five fields, and the modal used to stop
 * there - but the card and the detail popup both lead with the training fee,
 * so "edit the program" plainly means editing that too. The fee lives on the
 * pricing category the program points at, which until now could only be
 * reached from the Form Collection modal three menus away, where it sits among
 * the form's questions and has to be picked out of all three categories.
 *
 * So the one category this program actually uses is lifted out of that list
 * and edited here, in place - the same fields posted back into the same
 * config, because a second editor would be a second set of names to keep in
 * step with what the API validates.
 *
 * What it will not pretend: the category is shared. Two programs on "Only
 * Recruitment" have one price between them, and changing it here changes it
 * for both. That is said in the form rather than discovered afterwards, and
 * the programs sharing it are named.
 */
export function ProgramEditModal({ program, onClose, onSaved }) {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  // Two permissions, because these are two different powers. Renaming a
  // program is programs.update; the fees are the public form's pricing and
  // belong to whoever configures that. Somebody holding only the first sees
  // the pricing and cannot move it.
  const canPrice = hasPermission(PERMISSIONS.FORM_COLLECTION_CONFIGURE)

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  // Who else is on this category, so the warning can name them rather than
  // leave "other programs" to the imagination.
  const { data: allPrograms } = useQuery({
    queryKey: ['programs', 'all'],
    queryFn: () => programService.list({ page: 1, page_size: 100 }),
  })

  const { register, handleSubmit, reset, watch, setValue } = useForm()

  const categories = config?.categories ?? []
  const categoryFor = (code) => categories.find((category) => category.code === code)

  useEffect(() => {
    if (!config) return
    reset({
      name: program.name,
      category: program.category,
      description: program.description ?? '',
      order: program.order ?? 0,
      is_active: String(program.is_active),
      pricing: (config.categories ?? []).find((category) => category.code === program.category) ?? null,
    })
  }, [config, program, reset])

  // Moving the program to a different category has to bring that category's
  // own fees into view. Left alone the fields would still show the numbers of
  // the category just left, and saving would write them onto the new one.
  const chosen = watch('category')
  const pricingCode = watch('pricing.code')
  useEffect(() => {
    // No pricingCode guard: a program whose category has since been removed
    // has no pricing at all, and picking one for it is exactly when the fields
    // most need seeding.
    if (!config || !chosen || chosen === pricingCode) return
    const next = (config.categories ?? []).find((category) => category.code === chosen)
    if (next) setValue('pricing', next)
  }, [config, chosen, pricingCode, setValue])

  const mutation = useMutation({
    mutationFn: async (values) => {
      await programService.update(program.id, {
        name: values.name,
        category: values.category,
        description: values.description,
        order: Number(values.order || 0),
        is_active: values.is_active !== 'false',
      })
      // The program is saved; the pricing is a second write, to a different
      // document, and only where there is something to write. Its failure is
      // reported apart from the first so a refusal here never reads as
      // "nothing saved" when the program details already have.
      if (!canPrice || !values.pricing) return
      try {
        const updated = await foundationFormConfigService.update({
          offer_info: config.offer_info,
          fields: config.fields,
          // Only this program's category is touched; the other two go back
          // exactly as they came, because the API takes all three or none.
          categories: categories.map((category) =>
            category.code === values.pricing.code ? values.pricing : category,
          ),
          sections: config.sections,
        })
        queryClient.setQueryData(['foundation-form-config'], updated)
      } catch (cause) {
        throw new Error(`The program details saved, but its pricing didn't: ${getApiErrorMessage(cause)}`)
      }
    },
    // onSaved refetches the program list for us - including the roster this
    // modal reads to name who shares the category, which hangs off the same
    // key prefix.
    onSuccess: onSaved,
  })

  const pricing = chosen ? categoryFor(chosen) : null
  const sharedWith = (allPrograms?.items ?? []).filter(
    (other) => other.id !== program.id && other.category === chosen,
  )

  return (
    <Modal title={`Edit ${program.name}`} isOpen onClose={onClose} maxWidth="max-w-3xl">
      {isLoading && <LoadingSpinner />}
      <ErrorMessage message={error ? getApiErrorMessage(error) : null} />

      {config && (
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
          <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Program</h2>
            <Input label="Program Name" required {...register('name', { required: true })} />
            <Select label="Pricing Category" required {...register('category', { required: true })}>
              {categories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.label}
                </option>
              ))}
            </Select>
            <Textarea label="Description" rows={2} {...register('description')} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Display Order" type="number" {...register('order')} />
              <Select label="Status" required {...register('is_active', { required: true })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
            {/* The one thing here that cannot be edited, said where somebody
                would otherwise go looking for it: existing leads store this
                value, so renaming a program changes what it is called and not
                what it is. */}
            <p className="text-xs text-slate-400">
              Identifier{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{program.value}</code> is
              fixed - leads already reference it.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Pricing</h2>
              {!canPrice && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Read-only
                </span>
              )}
            </div>

            <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>
                These fees belong to the pricing category, not to this program alone.
                {sharedWith.length > 0 ? (
                  <>
                    {' '}
                    Changing them also changes{' '}
                    <span className="font-semibold">{sharedWith.map((other) => other.name).join(', ')}</span>.
                  </>
                ) : (
                  ' No other program uses it at the moment.'
                )}
              </span>
            </p>

            {pricing ? (
              <PricingCategoryFields
                // Remounted when the category changes, so every field is
                // re-seeded from the new one rather than keeping what was
                // typed against the old.
                key={pricing.code}
                category={pricing}
                path="pricing"
                register={register}
                disabled={!canPrice}
              />
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                This program&rsquo;s pricing category no longer exists, so there is nothing to price it with.
                Pick one above.
              </p>
            )}
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
