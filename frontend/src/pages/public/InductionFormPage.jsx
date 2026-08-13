import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { inductionFormService } from '@/services/inductionFormService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { PublicFormShell } from '@/components/public/PublicFormShell'
import { FormProgress } from '@/components/public/FormProgress'

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
    <PublicFormShell title="Induction Call Form" subtitle="HRNAVINOS">
      {children}
    </PublicFormShell>
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
    // A submit arriving before the last page isn't one the user asked for -
    // it's the browser having found a submit button some other way. Compared
    // against `page` rather than the `isLast` computed further down, which
    // doesn't exist on the loading and error branches.
    if (page !== PAGES.length - 1) return
    // Untouched optional fields arrive as "" from the DOM; the API expects
    // them absent rather than empty (paid_date="" fails date parsing).
    mutation.mutate(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')))
  }

  // The shell already draws the card, so these branches render their contents
  // straight into it rather than nesting a second bordered box inside the
  // first.
  if (configQuery.isLoading) {
    return (
      <Shell>
        <div className="py-6">
          <LoadingSpinner />
        </div>
      </Shell>
    )
  }

  if (configQuery.isError) {
    return (
      <Shell>
        <ErrorMessage message={getApiErrorMessage(configQuery.error)} />
      </Shell>
    )
  }

  if (submitted) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Details submitted</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
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
  //
  // preventDefault despite type="button": advancing re-renders this same
  // position as the Submit button, and React reuses the DOM node rather than
  // making a new one - so `type` flips to "submit" on the very element the
  // browser is still mid-click on. It then runs that element's activation
  // behaviour, reads the new type, and submits the half-filled form. Cancelling
  // the default action closes that off no matter what the element becomes.
  async function next(event) {
    event.preventDefault()
    const valid = await trigger(pageFields.filter((field) => field.required).map((field) => field.key))
    if (valid) setPage((current) => current + 1)
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormProgress current={page + 1} labels={PAGES.map((item) => item.title)} />
        {/* What this page is for, under the progress rather than beside it -
            one line of guidance is worth more than a second row of labels. */}
        <p className="mb-4 text-center text-xs text-slate-500">{PAGES[page].hint}</p>
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
          {/* Distinct keys, so React mounts a new button instead of retyping
              the one still under the pointer - the other half of the fix in
              `next` above, and the half that stops these two ever sharing a
              DOM node in the first place. */}
          {isLast ? (
            <Button key="submit" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          ) : (
            <Button key="next" type="button" onClick={next}>
              Next
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </Shell>
  )
}
