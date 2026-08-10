import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { inductionFormService } from '@/services/inductionFormService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'

// Which input a field gets is structural (a date is a date), so it's derived
// from the key rather than being another thing to configure. Batch is absent
// throughout - it's derived from the registration date by the backend and is
// never an input anywhere.
const INPUT_TYPE_BY_KEY = {
  email: 'email',
  registration_date: 'date',
  paid_date: 'date',
  phone: 'tel',
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Induction Call Form</h1>
            <p className="text-xs text-slate-500">HRNAVINOS</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function InductionFormPage() {
  const [submitted, setSubmitted] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  // The form describes itself from config, so renaming a question or editing
  // a dropdown in Admin > Form Collection shows up here on the next load with
  // no deploy.
  const configQuery = useQuery({
    queryKey: ['induction-form-public-config'],
    queryFn: inductionFormConfigService.getPublic,
  })

  const mutation = useMutation({
    mutationFn: (values) => inductionFormService.submit(values),
    onSuccess: () => setSubmitted(true),
  })

  function onSubmit(values) {
    // Untouched optional fields arrive as "" from the DOM; the API expects
    // them absent rather than empty (paid_date="" fails date parsing).
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''))
    mutation.mutate(payload)
  }

  if (submitted) {
    return (
      <Shell>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">Details submitted</h2>
          <p className="mt-1 text-sm text-slate-500">
            The entry has been recorded and assigned to a section admin.
          </p>
          <div className="mt-5">
            <Button
              variant="secondary"
              onClick={() => {
                reset()
                mutation.reset()
                setSubmitted(false)
              }}
            >
              Submit another
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  if (configQuery.isLoading) {
    return (
      <Shell>
        <div className="rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
          <LoadingSpinner />
        </div>
      </Shell>
    )
  }

  if (configQuery.isError) {
    return (
      <Shell>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorMessage message={getApiErrorMessage(configQuery.error)} />
        </div>
      </Shell>
    )
  }

  const fields = configQuery.data?.fields ?? []

  return (
    <Shell>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

        {fields.map((field) => {
          const hasOptions = field.options?.length > 0
          const listId = hasOptions ? `${field.key}-options` : undefined
          return (
            <div key={field.key}>
              <Input
                type={INPUT_TYPE_BY_KEY[field.key] ?? 'text'}
                list={listId}
                label={field.label}
                required={field.required}
                placeholder={hasOptions ? 'Select or type…' : undefined}
                autoComplete="off"
                error={errors[field.key]?.message}
                {...register(field.key, {
                  required: field.required ? `${field.label} is required` : false,
                })}
              />
              {hasOptions && (
                <datalist id={listId}>
                  {field.options.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </div>
          )
        })}

        <div className="pt-1">
          <Button type="submit" className="w-full justify-center" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Shell>
  )
}
