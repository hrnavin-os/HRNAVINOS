import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { inductionFormService } from '@/services/inductionFormService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'

// Which input a field gets is structural (a date is a date), so it's derived
// from the key rather than being another thing to configure. Batch is absent
// throughout - derived from the registration date by the backend and never an
// input anywhere.
const INPUT_TYPE_BY_KEY = {
  email: 'email',
  registration_date: 'date',
  paid_date: 'date',
  phone: 'tel',
}

const PAGES = [
  { title: 'Candidate details', hint: 'Who they are and when they registered' },
  { title: 'Source & category', hint: 'Where the lead came from and how they paid' },
]

// Page 1 is the candidate's own details, page 2 is how the lead is classified.
// Split on whether a field carries a dropdown rather than a hardcoded key list,
// so renaming or reordering a field in the config can't strand it off-form.
const pageOf = (field) => (field.options?.length > 0 ? 1 : 0)

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Induction Call Form</h1>
            <p className="text-xs uppercase tracking-wide text-slate-400">HRNAVINOS</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function PageRail({ current }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        {PAGES.map((page, index) => (
          <div key={page.title} className="flex flex-1 flex-col gap-1.5">
            <span
              className={`h-1 rounded-full transition-colors ${index <= current ? 'bg-brand-600' : 'bg-slate-200'}`}
            />
            <span className={`text-[11px] font-medium ${index <= current ? 'text-brand-700' : 'text-slate-400'}`}>
              {index + 1}. {page.title}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{PAGES[current].hint}</p>
    </div>
  )
}

export function InductionFormPage() {
  const [submitted, setSubmitted] = useState(false)
  const [page, setPage] = useState(0)
  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset,
    formState: { errors },
  } = useForm()

  // The form describes itself from config, so renaming a question or editing a
  // dropdown in Admin > Form Collection shows up here on the next load with no
  // deploy.
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
    mutation.mutate(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')))
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
                setPage(0)
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

  const fields = configQuery.data?.fields ?? []
  const pageFields = fields.filter((field) => pageOf(field) === page)
  const isLast = page === PAGES.length - 1

  // Only validates the page you're leaving, so a required field further on
  // can't block you before you've reached it.
  async function next() {
    const valid = await trigger(pageFields.filter((field) => field.required).map((field) => field.key))
    if (valid) setPage((current) => current + 1)
  }

  return (
    <Shell>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <PageRail current={page} />
        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

        <div className="space-y-4">
          {pageFields.map((field) =>
            field.options?.length > 0 ? (
              <Controller
                key={field.key}
                name={field.key}
                control={control}
                defaultValue=""
                rules={{ required: field.required ? `${field.label} is required` : false }}
                render={({ field: controlled }) => (
                  <Combobox
                    label={field.label}
                    required={field.required}
                    options={field.options}
                    value={controlled.value}
                    onChange={controlled.onChange}
                    error={errors[field.key]?.message}
                  />
                )}
              />
            ) : (
              <Input
                key={field.key}
                type={INPUT_TYPE_BY_KEY[field.key] ?? 'text'}
                label={field.label}
                required={field.required}
                error={errors[field.key]?.message}
                {...register(field.key, {
                  required: field.required ? `${field.label} is required` : false,
                })}
              />
            ),
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={() => setPage((c) => c - 1)} disabled={page === 0}>
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back
          </Button>
          {isLast ? (
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Next
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </Shell>
  )
}
