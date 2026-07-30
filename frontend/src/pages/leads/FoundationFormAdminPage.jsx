import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Textarea' },
]

let customFieldCounter = 0
function generateFieldKey() {
  customFieldCounter += 1
  return `custom_${Date.now()}_${customFieldCounter}`
}

function ShareLinkCard() {
  const [copied, setCopied] = useState(false)
  const formUrl = `${window.location.origin}/foundation-form`

  async function copyLink() {
    await navigator.clipboard.writeText(formUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-2 text-sm font-medium text-slate-700">Shareable form link</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={formUrl}
          onFocus={(event) => event.target.select()}
          className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm"
        />
        <Button type="button" variant="secondary" onClick={copyLink}>
          <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <a
        href={formUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Preview the form
      </a>
    </div>
  )
}

function FieldRow({ item, index, register, remove, canEdit }) {
  const isUndeletable = item.key === 'name' || item.key === 'mobile_number'
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-3">
      <input type="hidden" {...register(`fields.${index}.key`)} />
      <input type="hidden" {...register(`fields.${index}.is_system`)} />
      <div className="min-w-[180px] flex-1">
        <Input label="Label" disabled={!canEdit} {...register(`fields.${index}.label`, { required: true })} />
      </div>
      <div className="w-32">
        <label className="mb-1 block text-xs font-medium text-slate-700">Type</label>
        {item.is_system ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm capitalize text-slate-500">
            {item.type}
          </p>
        ) : (
          <Select disabled={!canEdit} {...register(`fields.${index}.type`)}>
            {FIELD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="w-28">
        <Select label="Page" disabled={!canEdit} {...register(`fields.${index}.page`, { valueAsNumber: true })}>
          <option value={1}>Page 1</option>
          <option value={3}>Page 3</option>
        </Select>
      </div>
      <div className="w-20">
        <Input
          label="Order"
          type="number"
          disabled={!canEdit}
          {...register(`fields.${index}.order`, { valueAsNumber: true })}
        />
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-700">
        <input type="checkbox" disabled={!canEdit} {...register(`fields.${index}.required`)} />
        Required
      </label>
      {item.is_system && (
        <span className="pb-2">
          <Badge tone="slate">System</Badge>
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => remove(index)}
          disabled={isUndeletable}
          title={isUndeletable ? "Name and Mobile Number can't be removed" : 'Delete field'}
          className="mb-2 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function CategoryEditor({ category, categoryIndex, register, canEdit }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <input type="hidden" {...register(`categories.${categoryIndex}.code`)} />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Category Label" disabled={!canEdit} {...register(`categories.${categoryIndex}.label`, { required: true })} />
        <Input
          label="Training Fee"
          disabled={!canEdit}
          {...register(`categories.${categoryIndex}.training_fee`, { required: true })}
        />
        <Input
          label="After Placement Fee"
          disabled={!canEdit}
          {...register(`categories.${categoryIndex}.after_placement_fee`, { required: true })}
        />
      </div>
      <div className="space-y-3">
        {category.plans.map((plan, planIndex) => (
          <div key={plan.value} className="rounded-md bg-slate-50 p-3">
            <input type="hidden" {...register(`categories.${categoryIndex}.plans.${planIndex}.value`)} />
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {plan.value.replace(/_/g, ' ')}
            </p>
            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Plan Label"
                disabled={!canEdit}
                {...register(`categories.${categoryIndex}.plans.${planIndex}.label`, { required: true })}
              />
              <Input
                label="Summary"
                disabled={!canEdit}
                {...register(`categories.${categoryIndex}.plans.${planIndex}.summary`, { required: true })}
              />
            </div>
            <div className="mb-2">
              <Input
                label="After Placement"
                disabled={!canEdit}
                {...register(`categories.${categoryIndex}.plans.${planIndex}.after_placement`, { required: true })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {plan.amounts.map((_, amountIndex) => (
                <div key={amountIndex} className="w-28">
                  <Input
                    label={`Amount ${amountIndex + 1}`}
                    type="number"
                    disabled={!canEdit}
                    {...register(`categories.${categoryIndex}.plans.${planIndex}.amounts.${amountIndex}`, {
                      required: true,
                      valueAsNumber: true,
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FoundationFormAdminPage() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(PERMISSIONS.LEADS_UPDATE)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
  } = useForm()

  const { fields, append, remove } = useFieldArray({ control, name: 'fields' })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const mutation = useMutation({
    mutationFn: foundationFormConfigService.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['foundation-form-config'], updated)
      reset(updated)
    },
  })

  if (isLoading) return <LoadingSpinner />

  function addField(page) {
    append({ key: generateFieldKey(), page, type: 'text', label: 'New Field', required: false, order: 99, is_system: false })
  }

  function onSubmit(values) {
    mutation.mutate({
      offer_info: values.offer_info,
      fields: values.fields,
      programs: values.programs,
      categories: values.categories,
    })
  }

  const page1Fields = fields.map((item, index) => ({ item, index })).filter(({ item }) => Number(item.page) === 1)
  const page3Fields = fields.map((item, index) => ({ item, index })).filter(({ item }) => Number(item.page) === 3)

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <ClipboardCheck className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
          Foundation Form
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Share this link with prospective students on a call or meet. When they submit it, their details are
          added straight to Admin.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        <ShareLinkCard />

        <ErrorMessage message={error ? getApiErrorMessage(error) : null} />

        {data && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Payment Offers (Page 1 info box)</h2>
              <Textarea rows={6} disabled={!canEdit} {...register('offer_info')} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Page 1 Fields</h2>
                {canEdit && (
                  <Button type="button" variant="secondary" onClick={() => addField(1)}>
                    <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Add Field
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {page1Fields.map(({ item, index }) => (
                  <FieldRow key={item.id} item={item} index={index} register={register} remove={remove} canEdit={canEdit} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Page 3 Fields</h2>
                {canEdit && (
                  <Button type="button" variant="secondary" onClick={() => addField(3)}>
                    <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Add Field
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {page3Fields.map(({ item, index }) => (
                  <FieldRow key={item.id} item={item} index={index} register={register} remove={remove} canEdit={canEdit} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Programs & Pricing</h2>
              <div className="space-y-6">
                {(data.categories ?? []).map((category, categoryIndex) => (
                  <CategoryEditor
                    key={category.code}
                    category={category}
                    categoryIndex={categoryIndex}
                    register={register}
                    canEdit={canEdit}
                  />
                ))}
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Programs</h3>
                <div className="space-y-2">
                  {(data.programs ?? []).map((program, programIndex) => (
                    <div key={program.value} className="flex items-center gap-3">
                      <input type="hidden" {...register(`programs.${programIndex}.value`)} />
                      <input type="hidden" {...register(`programs.${programIndex}.category`)} />
                      <div className="flex-1">
                        <Input
                          label={programIndex === 0 ? 'Program Name' : undefined}
                          disabled={!canEdit}
                          {...register(`programs.${programIndex}.label`, { required: true })}
                        />
                      </div>
                      <p className="pb-2 text-xs text-slate-400">Category: {program.category}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
