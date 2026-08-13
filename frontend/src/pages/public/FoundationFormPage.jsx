import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BadgePercent, BookOpen, Calendar, CheckCircle2 } from 'lucide-react'
import { foundationFormService } from '@/services/foundationFormService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PublicFormShell } from '@/components/public/PublicFormShell'
import { FormProgress } from '@/components/public/FormProgress'

// Keys with dedicated typed handling on submit (backend FoundationFormSubmit
// fields) - anything else registered on the form goes into custom_fields.
const KNOWN_KEYS = new Set(['name', 'mobile_number', 'email', 'program_interest', 'payment_plan', 'payment_timeline', 'queries'])

const STEP_TYPE_LABELS = { details: 'Your Details', plan: 'Payment Plan', page3: 'Confirm & Submit' }

function InfoBox({ title, icon: Icon, children }) {
  return (
    // Left edge rather than a full tint, matching the panels used across the
    // rest of the app - a solid wash on a form makes the note compete with the
    // fields it is meant to support.
    <div className="mb-5 overflow-hidden rounded-lg border border-slate-200 border-l-4 border-l-brand-500 bg-white">
      {title && (
        <div className="flex items-center gap-2 border-b border-slate-100 bg-brand-50/60 px-3.5 py-2 text-sm font-semibold text-brand-700">
          {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
          {title}
        </div>
      )}
      <div className="whitespace-pre-line px-3.5 py-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  )
}

// The plan summary arrives as "₹15,000 (₹7,500 Per Month)" - the total, then
// how it is broken up. Split so the amount can lead at full size instead of
// sitting mid-sentence, which is the number somebody is actually choosing on.
function splitAmount(summary) {
  const match = String(summary ?? '').match(/^(.*?)\s*\((.+)\)$/)
  return { total: match?.[1]?.trim() ?? summary, detail: match?.[2]?.trim() ?? null }
}

// One selectable option - a payment plan or a payment day. A bordered card that
// fills in when chosen, so the choice is legible at a glance on a phone rather
// than resting on a 13px radio dot.
function ChoiceCard({ children, ...inputProps }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300 has-checked:border-brand-500 has-checked:bg-brand-50/60 has-checked:ring-1 has-checked:ring-brand-500">
      <input type="radio" className="mt-1 h-4 w-4 shrink-0 text-brand-600 focus:ring-brand-500" {...inputProps} />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
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
          <ChoiceCard
            key={option.value}
            value={option.value}
            {...register('payment_timeline', { required: field.required ? 'Please select when you will pay' : false })}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="text-xs text-slate-500">{formatDate(option.date)}</span>
            </span>
            {watchedValue === option.value && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                Selected
              </span>
            )}
          </ChoiceCard>
        ))}
      </div>
      {errors.payment_timeline && <p className="mt-1 text-xs text-red-600">{errors.payment_timeline.message}</p>}
    </fieldset>
  )
}

export function FoundationFormPage() {
  const { section } = useParams()
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
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Thank you!</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Your details have been submitted successfully. Our team will call you shortly to confirm your seat.
          </p>
          {/* Says what happens next rather than leaving somebody on a dead end
              wondering whether it went through. */}
          <p className="mt-4 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
            You can close this page now — nothing else is needed from you.
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
    if (section) payload.section = section
    submitMutation.mutate(payload)
  }

  return (
    <FormShell>
      <FormProgress current={stepIndex + 1} labels={stepLabels} />
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
              {/* Each plan reads as a priced card: the amount leads, the
                  instalment breakdown sits under it, and the after-placement
                  fee is a chip rather than the tail of a run-on sentence.
                  It was one line - "Single Shot Payment - ₹15,000 (₹7,500 Per
                  Month) | After Placement - ₹2,500" - which buries the two
                  numbers the choice actually turns on. */}
              <div className="space-y-2.5">
                {category.plans.map((plan) => {
                  const { total, detail } = splitAmount(plan.summary)
                  return (
                    <ChoiceCard
                      key={plan.value}
                      value={plan.value}
                      {...register('payment_plan', { required: 'Please select a payment option' })}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-sm font-semibold text-slate-900">{plan.label}</span>
                        <span className="text-base font-bold text-brand-700">{total}</span>
                      </span>
                      {detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        After placement {plan.after_placement}
                      </span>
                      {watchedPaymentPlan === plan.value && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                          Selected
                        </span>
                      )}
                    </ChoiceCard>
                  )
                })}
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
    <PublicFormShell title="HRNAVINOS" subtitle="Enrolment Form">
      {children}
    </PublicFormShell>
  )
}
