import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { foundationFormService } from '@/services/foundationFormService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STEP_FIELDS = {
  1: ['name', 'mobile_number', 'email', 'program_interest'],
  2: ['payment_plan'],
  3: ['payment_timeline', 'queries'],
}

const OFFER_INFO = `Single Payment Offer:
Flat ₹2,500 OFF in Post Placement fee

Two-Payment Offer:
Flat ₹1,500 OFF in Post Placement fee

EMI Option (6 Weeks): (No Discounts)
Training fees can be paid in 6 weekly equal installments.
Example: If your training fee is ₹20,000, you will pay ₹3,300 per week for 6 weeks.`

function InfoBox({ children }) {
  return (
    <div className="mb-5 whitespace-pre-line rounded-md border border-brand-200 bg-brand-50 p-4 text-sm text-slate-700">
      {children}
    </div>
  )
}

function StepIndicator({ step }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold
              ${n <= step ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}
          >
            {n}
          </div>
          {n < 3 && <div className={`h-0.5 flex-1 ${n < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
        </div>
      ))}
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

const TIMELINE_OPTIONS = [
  { value: 'immediate', label: 'Immediate', date: new Date() },
  { value: 'tomorrow', label: 'Tomorrow', date: addDays(new Date(), 1) },
  { value: 'day_after_tomorrow', label: 'Day after tomorrow', date: addDays(new Date(), 2) },
]

export function FoundationFormPage() {
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)

  const pricingQuery = useQuery({ queryKey: ['foundation-form-pricing'], queryFn: foundationFormService.getPricing })

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: 'onChange',
    defaultValues: {
      name: '',
      mobile_number: '',
      email: '',
      program_interest: '',
      payment_plan: '',
      payment_timeline: '',
      queries: '',
    },
  })

  const submitMutation = useMutation({
    mutationFn: foundationFormService.submit,
    onSuccess: () => setSubmitted(true),
  })

  async function handleNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (valid) setStep((s) => s + 1)
  }

  function onSubmit(values) {
    submitMutation.mutate(values)
  }

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

  const { programs, categories } = pricingQuery.data
  const selectedProgramValue = watch('program_interest')
  const selectedProgram = programs.find((p) => p.value === selectedProgramValue)
  const category = selectedProgram ? categories[selectedProgram.category] : null

  return (
    <FormShell>
      <StepIndicator step={step} />
      <form onSubmit={handleSubmit(onSubmit)}>
        {step === 1 && (
          <div className="space-y-4">
            <InfoBox>{OFFER_INFO}</InfoBox>
            <Input
              label="Name"
              required
              error={errors.name?.message}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name is too short' } })}
            />
            <Input
              label="Mobile Number"
              required
              error={errors.mobile_number?.message}
              {...register('mobile_number', {
                required: 'Mobile number is required',
                pattern: { value: /^[0-9+\-\s]{6,20}$/, message: 'Enter a valid mobile number' },
              })}
            />
            <Input
              label="Email Address"
              type="email"
              required
              error={errors.email?.message}
              {...register('email', {
                required: 'Email address is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
              })}
            />
            <Select
              label="Program you are planning to join?"
              required
              error={errors.program_interest?.message}
              {...register('program_interest', { required: 'Please select a program' })}
            >
              <option value="">Select a program</option>
              {programs.map((program) => (
                <option key={program.value} value={program.value}>
                  {program.label}
                </option>
              ))}
            </Select>
            <Button type="button" className="w-full" onClick={handleNext}>
              Next
            </Button>
          </div>
        )}

        {step === 2 && category && (
          <div className="space-y-4">
            <InfoBox>
              {category.label}:{'\n'}Training Fee: {category.training_fee}{'  '}
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
                      has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      value={plan.value}
                      className="mt-0.5"
                      {...register('payment_plan', { required: 'Please select a payment option' })}
                    />
                    <span>
                      <span className="font-medium text-slate-800">{plan.label}</span>
                      {' - '}
                      {plan.summary}
                      {' | '}After Placement - {plan.after_placement}
                    </span>
                  </label>
                ))}
              </div>
              {errors.payment_plan && <p className="mt-1 text-xs text-red-600">{errors.payment_plan.message}</p>}
            </fieldset>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="button" className="w-full" onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-slate-700">
                When will you make the payment? <span className="text-red-500">*</span>
              </legend>
              <div className="space-y-2">
                {TIMELINE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-300 p-3 text-sm
                      has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      value={option.value}
                      {...register('payment_timeline', { required: 'Please select when you will pay' })}
                    />
                    <span>
                      <span className="font-medium text-slate-800">{option.label}</span>{' '}
                      <span className="text-slate-500">({formatDate(option.date)})</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.payment_timeline && (
                <p className="mt-1 text-xs text-red-600">{errors.payment_timeline.message}</p>
              )}
            </fieldset>
            <Textarea
              label="Any doubts or queries"
              required
              error={errors.queries?.message}
              {...register('queries', { required: 'Please share your doubts or queries' })}
            />
            <ErrorMessage
              message={submitMutation.isError ? getApiErrorMessage(submitMutation.error) : null}
            />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="submit" className="w-full" disabled={isSubmitting || submitMutation.isPending}>
                {submitMutation.isPending ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
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
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  )
}
