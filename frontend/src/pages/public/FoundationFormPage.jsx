import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BadgePercent, BookOpen, Calendar, Check, CheckCircle2 } from 'lucide-react'
import { foundationFormService } from '@/services/foundationFormService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

// Keys with dedicated typed handling on submit (backend FoundationFormSubmit
// fields) - anything else registered on the form goes into custom_fields.
const KNOWN_KEYS = new Set(['name', 'mobile_number', 'email', 'program_interest', 'payment_plan', 'payment_timeline', 'queries'])

const STEP_TYPE_LABELS = { details: 'Your Details', plan: 'Payment Plan', page3: 'Confirm & Submit' }

function InfoBox({ title, icon: Icon, children }) {
  return (
    <div className="mb-5 rounded-md border border-brand-200 bg-brand-50 p-4 text-sm text-slate-700">
      {title && (
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          {Icon && <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          {title}
        </div>
      )}
      <div className="whitespace-pre-line">{children}</div>
    </div>
  )
}

function StepIndicator({ current, labels }) {
  const total = labels.length
  return (
    <div className="mb-6">
      <div className="flex items-center justify-center gap-2">
        {labels.map((_, i) => {
          const n = i + 1
          return (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold
                  ${n <= current ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}
              >
                {n < current ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : n}
              </div>
              {n < total && <div className={`h-0.5 w-12 ${n < current ? 'bg-brand-600' : 'bg-slate-200'}`} />}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs font-medium text-slate-500">
        Step {current} of {total} — {labels[current - 1]}
      </p>
    </div>
  )
}

function addDays(date, days) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function formatDate(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatWeekday(date) {
  return date.toLocaleDateString('en-IN', { weekday: 'long' })
}

const TIMELINE_OPTIONS = [
  { value: 'immediate', date: new Date() },
  { value: 'tomorrow', date: addDays(new Date(), 1) },
  { value: 'day_after_tomorrow', date: addDays(new Date(), 2) },
].map((option) => ({ ...option, label: formatWeekday(option.date) }))

// Generic renderer for any plain text/email/tel/textarea field - system
// (Name/Mobile/Email/Queries) or admin-added custom ones alike.
function DynamicField({ field, register, errors }) {
  const validation = { required: field.required ? `${field.label} is required` : false }
  if (field.type === 'textarea') {
    return <Textarea label={field.label} required={field.required} error={errors[field.key]?.message} {...register(field.key, validation)} />
  }
  const inputType = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'
  return (
    <Input
      type={inputType}
      label={field.label}
      required={field.required}
      error={errors[field.key]?.message}
      {...register(field.key, validation)}
    />
  )
}

function ProgramField({ field, programs, register, errors }) {
  return (
    <Select
      label={field.label}
      required={field.required}
      error={errors.program_interest?.message}
      {...register('program_interest', { required: field.required ? 'Please select a program' : false })}
    >
      <option value="">Select a program</option>
      {programs.map((program) => (
        <option key={program.value} value={program.value}>
          {program.label}
        </option>
      ))}
    </Select>
  )
}

function PaymentTimelineField({ field, watchedValue, register, errors }) {
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Calendar className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
        {field.label} {field.required && <span className="text-red-500">*</span>}
      </legend>
      <div className="space-y-2">
        {TIMELINE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-300 p-3 text-sm
              has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-500"
          >
            <input
              type="radio"
              value={option.value}
              {...register('payment_timeline', { required: field.required ? 'Please select when you will pay' : false })}
            />
            <span className="flex-1">
              <span className="font-medium text-slate-800">{option.label}</span>{' '}
              <span className="text-slate-500">({formatDate(option.date)})</span>
            </span>
            {watchedValue === option.value && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} aria-hidden="true" />
            )}
          </label>
        ))}
      </div>
      {errors.payment_timeline && <p className="mt-1 text-xs text-red-600">{errors.payment_timeline.message}</p>}
    </fieldset>
  )
}

export function FoundationFormPage() {
  const [stepIndex, setStepIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  const pricingQuery = useQuery({ queryKey: ['foundation-form-pricing'], queryFn: foundationFormService.getPricing })

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onChange' })

  const submitMutation = useMutation({
    mutationFn: foundationFormService.submit,
    onSuccess: () => setSubmitted(true),
  })

  if (pricingQuery.isLoading) {
    return (
      <FormShell>
        <LoadingSpinner />
      </FormShell>
    )
  }

  if (pricingQuery.isError) {
    return (
      <FormShell>
        <ErrorMessage message={getApiErrorMessage(pricingQuery.error)} />
      </FormShell>
    )
  }

  if (submitted) {
    return (
      <FormShell>
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle2 className="mb-3 h-12 w-12 text-green-600" strokeWidth={1.5} aria-hidden="true" />
          <h1 className="text-lg font-semibold text-slate-900">Thank you!</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your details have been submitted successfully. Our team will get in touch with you shortly.
          </p>
        </div>
      </FormShell>
    )
  }

  const { offer_info: offerInfo, fields, programs, categories } = pricingQuery.data
  const page1Fields = fields.filter((f) => f.page === 1)
  const page3Fields = fields.filter((f) => f.page === 3)
  const hasProgramField = page1Fields.some((f) => f.key === 'program_interest')

  const steps = ['details', ...(hasProgramField ? ['plan'] : []), ...(page3Fields.length > 0 ? ['page3'] : [])]
  const stepLabels = steps.map((s) => STEP_TYPE_LABELS[s])
  const currentStep = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  const selectedProgramValue = watch('program_interest')
  const selectedProgram = programs.find((p) => p.value === selectedProgramValue)
  const category = selectedProgram ? categories[selectedProgram.category] : null
  const watchedPaymentPlan = watch('payment_plan')
  const watchedPaymentTimeline = watch('payment_timeline')

  const STEP_FIELD_KEYS = {
    details: page1Fields.map((f) => f.key),
    plan: ['payment_plan'],
    page3: page3Fields.map((f) => f.key),
  }

  async function handleNext() {
    const valid = await trigger(STEP_FIELD_KEYS[currentStep])
    if (valid) setStepIndex((i) => i + 1)
  }

  function onSubmit(values) {
    const payload = { name: values.name, mobile_number: values.mobile_number, custom_fields: {} }
    for (const key of ['email', 'program_interest', 'payment_plan', 'payment_timeline', 'queries']) {
      if (values[key]) payload[key] = values[key]
    }
    for (const [key, value] of Object.entries(values)) {
      if (!KNOWN_KEYS.has(key) && value) payload.custom_fields[key] = value
    }
    submitMutation.mutate(payload)
  }

  return (
    <FormShell>
      <StepIndicator current={stepIndex + 1} labels={stepLabels} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {currentStep === 'details' && (
          <div className="space-y-4">
            <InfoBox title="Payment Offers" icon={BadgePercent}>
              {offerInfo}
            </InfoBox>
            {page1Fields.map((field) =>
              field.key === 'program_interest' ? (
                <ProgramField key={field.key} field={field} programs={programs} register={register} errors={errors} />
              ) : (
                <DynamicField key={field.key} field={field} register={register} errors={errors} />
              ),
            )}
            <Button
              type={isLastStep ? 'submit' : 'button'}
              className="w-full"
              onClick={isLastStep ? undefined : handleNext}
              disabled={isLastStep && (isSubmitting || submitMutation.isPending)}
            >
              {isLastStep ? (submitMutation.isPending ? 'Submitting…' : 'Submit') : 'Next'}
            </Button>
          </div>
        )}

        {currentStep === 'plan' && category && (
          <div className="space-y-4">
            <InfoBox title={category.label} icon={BookOpen}>
              Training Fee: {category.training_fee}
              {'   •   '}
              After Placement Fees: {category.after_placement_fee}
            </InfoBox>
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-slate-700">
                Payment Details <span className="text-red-500">*</span>
              </legend>
              <div className="space-y-2">
                {category.plans.map((plan) => (
                  <label
                    key={plan.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3 text-sm
                      has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-500"
                  >
                    <input
                      type="radio"
                      value={plan.value}
                      className="mt-0.5"
                      {...register('payment_plan', { required: 'Please select a payment option' })}
                    />
                    <span className="flex-1">
                      <span className="font-medium text-slate-800">{plan.label}</span>
                      {' - '}
                      {plan.summary}
                      {' | '}After Placement - {plan.after_placement}
                    </span>
                    {watchedPaymentPlan === plan.value && (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} aria-hidden="true" />
                    )}
                  </label>
                ))}
              </div>
              {errors.payment_plan && <p className="mt-1 text-xs text-red-600">{errors.payment_plan.message}</p>}
            </fieldset>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
              <Button
                type={isLastStep ? 'submit' : 'button'}
                className="w-full"
                onClick={isLastStep ? undefined : handleNext}
                disabled={isLastStep && (isSubmitting || submitMutation.isPending)}
              >
                {isLastStep ? (submitMutation.isPending ? 'Submitting…' : 'Submit') : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'page3' && (
          <div className="space-y-4">
            {page3Fields.map((field) =>
              field.key === 'payment_timeline' ? (
                <PaymentTimelineField
                  key={field.key}
                  field={field}
                  watchedValue={watchedPaymentTimeline}
                  register={register}
                  errors={errors}
                />
              ) : (
                <DynamicField key={field.key} field={field} register={register} errors={errors} />
              ),
            )}
            <ErrorMessage message={submitMutation.isError ? getApiErrorMessage(submitMutation.error) : null} />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
              <Button type="submit" className="w-full" disabled={isSubmitting || submitMutation.isPending}>
                {submitMutation.isPending ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
        )}

        {isLastStep && currentStep !== 'page3' && (
          <ErrorMessage message={submitMutation.isError ? getApiErrorMessage(submitMutation.error) : null} />
        )}
      </form>
    </FormShell>
  )
}

function FormShell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-brand-700">HRNAVINOS</span>
          <span className="ml-1 text-2xl font-light text-slate-500">ERP</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-md">{children}</div>
      </div>
    </div>
  )
}
