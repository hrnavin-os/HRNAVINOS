import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BadgePercent, BookOpen, CheckCircle2 } from 'lucide-react'
import { foundationFormService } from '@/services/foundationFormService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PublicFormShell } from '@/components/public/PublicFormShell'
import { FormProgress } from '@/components/public/FormProgress'
// The same question components the staff Create Lead modal renders, so the two
// always ask the same things - see components/foundation/FoundationQuestions.
import {
  DynamicField,
  PaymentPlanField,
  PaymentTimelineField,
  ProgramField,
  buildCustomFields,
} from '@/components/foundation/FoundationQuestions'

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
    payload.custom_fields = buildCustomFields(values)
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
            <PaymentPlanField
              category={category}
              selected={watchedPaymentPlan}
              register={register}
              errors={errors}
            />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
              <Button
                type={isLastStep ? 'submit' : 'button'}
                className="flex-1"
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
                  selected={watchedPaymentTimeline}
                  register={register}
                  errors={errors}
                />
              ) : (
                <DynamicField key={field.key} field={field} register={register} errors={errors} />
              ),
            )}
            <ErrorMessage message={submitMutation.isError ? getApiErrorMessage(submitMutation.error) : null} />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting || submitMutation.isPending}>
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
