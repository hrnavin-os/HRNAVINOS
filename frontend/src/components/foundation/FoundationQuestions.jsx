import { Calendar, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

/**
 * The Foundation Form's questions, as components.
 *
 * Two places ask them: the public form a candidate fills in themselves, and
 * the Create Lead modal a staffer fills in while the candidate is on the
 * phone. They are the same questions - the same admin-configured field list,
 * the same program dropdown, the same priced plan cards - so they render from
 * the same components rather than from two copies that drift apart the first
 * time an admin adds a field.
 *
 * Nothing here decides what is required or what happens on submit: each caller
 * passes its own rules, because a stranger submitting a form and a staffer
 * transcribing a call are held to different ones.
 */

// Keys the API has a typed field for. Anything else an admin adds to the form
// is carried in custom_fields, on both submit paths.
export const KNOWN_KEYS = new Set([
  'name',
  'mobile_number',
  'email',
  'program_interest',
  'payment_plan',
  'payment_timeline',
  'queries',
])

export function buildCustomFields(values, extraKnownKeys = []) {
  const known = new Set([...KNOWN_KEYS, ...extraKnownKeys])
  const custom = {}
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key) && value) custom[key] = value
  }
  return custom
}

// The plan summary arrives as "₹15,000 (₹7,500 Per Month)" - the total, then
// how it is broken up. Split so the amount can lead at full size instead of
// sitting mid-sentence, which is the number somebody is actually choosing on.
export function splitAmount(summary) {
  const match = String(summary ?? '').match(/^(.*?)\s*\((.+)\)$/)
  return { total: match?.[1]?.trim() ?? summary, detail: match?.[2]?.trim() ?? null }
}

// One selectable option - a payment plan or a payment day. A bordered card that
// fills in when chosen, so the choice is legible at a glance on a phone rather
// than resting on a 13px radio dot.
export function ChoiceCard({ children, ...inputProps }) {
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

// Built per render rather than once at module load: the staff board is left
// open all day, and a list computed at load would still be offering
// yesterday's three days after midnight.
export function timelineOptions() {
  const today = new Date()
  return [
    { value: 'immediate', date: today },
    { value: 'tomorrow', date: addDays(today, 1) },
    { value: 'day_after_tomorrow', date: addDays(today, 2) },
  ].map((option) => ({ ...option, label: formatWeekday(option.date) }))
}

// Generic renderer for any plain text/email/tel/textarea field - system
// (Name/Mobile/Email/Queries) or admin-added custom ones alike.
export function DynamicField({ field, name, register, errors, required, rules }) {
  // The key an answer registers under is the config's key by default, but the
  // Create Lead modal maps two of them onto the CRM's own names
  // (mobile_number -> phone, queries -> notes) so its payload stays a LeadCreate.
  const key = name ?? field.key
  const isRequired = required ?? field.required
  const validation = { required: isRequired ? `${field.label} is required` : false, ...rules }
  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label}
        required={isRequired}
        error={errors[key]?.message}
        {...register(key, validation)}
      />
    )
  }
  const inputType = field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'
  return (
    <Input
      type={inputType}
      label={field.label}
      required={isRequired}
      error={errors[key]?.message}
      {...register(key, validation)}
    />
  )
}

export function ProgramField({ field, programs, register, errors, required }) {
  const isRequired = required ?? field.required
  return (
    <Select
      label={field.label}
      required={isRequired}
      error={errors.program_interest?.message}
      {...register('program_interest', { required: isRequired ? 'Please select a program' : false })}
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

// The priced plan cards for whichever program was chosen. Each plan reads as a
// priced card: the amount leads, the instalment breakdown sits under it, and
// the after-placement fee is a chip rather than the tail of a run-on sentence.
// It was one line - "Single Shot Payment - ₹15,000 (₹7,500 Per Month) | After
// Placement - ₹2,500" - which buries the two numbers the choice turns on.
export function PaymentPlanField({
  category,
  selected,
  register,
  errors,
  required = true,
  legend = 'Payment Details',
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-slate-700">
        {legend} {required && <span className="text-red-500">*</span>}
      </legend>
      <div className="space-y-2.5">
        {category.plans.map((plan) => {
          const { total, detail } = splitAmount(plan.summary)
          return (
            <ChoiceCard
              key={plan.value}
              value={plan.value}
              {...register('payment_plan', { required: required ? 'Please select a payment option' : false })}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-sm font-semibold text-slate-900">{plan.label}</span>
                <span className="text-base font-bold text-brand-700">{total}</span>
              </span>
              {detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                After placement {plan.after_placement}
              </span>
              {selected === plan.value && (
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
  )
}

export function PaymentTimelineField({ field, selected, register, errors, required }) {
  const isRequired = required ?? field.required
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <Calendar className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
        {field.label} {isRequired && <span className="text-red-500">*</span>}
      </legend>
      <div className="space-y-2">
        {timelineOptions().map((option) => (
          <ChoiceCard
            key={option.value}
            value={option.value}
            {...register('payment_timeline', {
              required: isRequired ? 'Please select when you will pay' : false,
            })}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{option.label}</span>
              <span className="text-xs text-slate-500">{formatDate(option.date)}</span>
            </span>
            {selected === option.value && (
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
