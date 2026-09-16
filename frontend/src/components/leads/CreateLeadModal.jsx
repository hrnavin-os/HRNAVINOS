import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { leadService } from '@/services/leadService'
import { foundationFormService } from '@/services/foundationFormService'
import { getApiErrorMessage } from '@/services/apiClient'
import {
  DynamicField,
  PaymentPlanField,
  PaymentTimelineField,
  ProgramField,
  buildCustomFields,
} from '@/components/foundation/FoundationQuestions'

// Two of the form's keys are called something else on a lead. Registering them
// under the CRM's names keeps the payload a plain LeadCreate and keeps them out
// of custom_fields, which is for questions the API has no typed field for.
const FIELD_NAMES = { mobile_number: 'phone', queries: 'notes' }
const EXTRA_KNOWN_KEYS = ['phone', 'notes', 'section']

/**
 * Hand-keys a lead straight onto the Foundation board.
 *
 * Most leads still arrive through the public Foundation Form, but a walk-in or
 * a phone enquiry has nobody to fill one in. This asks the same questions that
 * form asks - the same admin-configured field list, the same program dropdown,
 * the same priced payment plans, the same payment-day choice - so a lead keyed
 * in here lands on the board carrying the same information as one that came
 * through the form, rather than a stub somebody has to go back and fill in.
 *
 * The public form's three pages become one scrolling modal: a staffer is
 * transcribing a live call, not being walked through an enrolment, and paging
 * back and forth to correct what somebody just said is friction the candidate
 * hears.
 *
 * What is *required* is deliberately not taken from the form config. Those
 * flags exist to stop a stranger submitting a blank form; a staffer on a call
 * genuinely may not have an email address or a decided payment plan, and
 * forcing the field only gets a fake value typed into it. So everything is
 * asked, and only what a usable row cannot exist without is enforced.
 */
export function CreateLeadModal({ sections, defaultSection, lockSection, onClose }) {
  const queryClient = useQueryClient()

  // The same query key the board and the public form already use, so opening
  // this modal is normally a cache read rather than a request.
  const pricingQuery = useQuery({ queryKey: ['foundation-form-pricing'], queryFn: foundationFormService.getPricing })

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ defaultValues: { section: defaultSection || '' } })

  const mutation = useMutation({
    mutationFn: leadService.create,
    onSuccess: () => {
      // The new row, the stat cards above it, and the Course filter's list of
      // values in use can all have changed.
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      queryClient.invalidateQueries({ queryKey: ['lead-course-options'] })
      onClose()
    },
  })

  const programValue = watch('program_interest')
  const paymentPlan = watch('payment_plan')
  const paymentTimeline = watch('payment_timeline')

  function onSubmit(values) {
    mutation.mutate({
      name: values.name.trim(),
      phone: values.phone.trim(),
      // An empty string here would fail the API's email validation, and "no
      // email given" is a normal state for a phone enquiry.
      email: values.email?.trim() || null,
      // The program is what the form asks and what prices the plan; the
      // backend derives course_interest from it, so it isn't sent separately.
      program_interest: values.program_interest || null,
      payment_plan: values.payment_plan || null,
      payment_timeline: values.payment_timeline || null,
      // A section-scoped user's own section is forced by the backend anyway;
      // sending it keeps the two agreeing on what was just created.
      section: lockSection ? defaultSection : values.section || null,
      notes: values.notes?.trim() || null,
      // Whatever an admin has added to the form beyond the built-in questions.
      custom_fields: buildCustomFields(values, EXTRA_KNOWN_KEYS),
    })
  }

  const sectionLabel = sections.find((section) => section.code === defaultSection)?.label ?? defaultSection

  const fields = pricingQuery.data?.fields ?? []
  const programs = pricingQuery.data?.programs ?? []
  const categories = pricingQuery.data?.categories ?? {}
  const page1Fields = fields.filter((field) => field.page === 1)
  const page3Fields = fields.filter((field) => field.page === 3)
  const selectedProgram = programs.find((program) => program.value === programValue)
  const category = selectedProgram ? categories[selectedProgram.category] : null

  // Name and mobile number are the two the CRM cannot store a lead without, so
  // they keep their validation whatever the form config says about them.
  const RULES = {
    name: { minLength: { value: 2, message: 'Name is too short' } },
    mobile_number: { minLength: { value: 6, message: 'Mobile number is too short' } },
  }
  const ALWAYS_REQUIRED = new Set(['name', 'mobile_number'])

  function renderField(field) {
    if (field.key === 'program_interest') {
      return (
        <ProgramField
          key={field.key}
          field={field}
          programs={programs}
          register={register}
          errors={errors}
          required={false}
        />
      )
    }
    if (field.key === 'payment_timeline') {
      return (
        <PaymentTimelineField
          key={field.key}
          field={field}
          selected={paymentTimeline}
          register={register}
          errors={errors}
          required={false}
        />
      )
    }
    return (
      <DynamicField
        key={field.key}
        field={field}
        name={FIELD_NAMES[field.key]}
        register={register}
        errors={errors}
        required={ALWAYS_REQUIRED.has(field.key)}
        rules={RULES[field.key]}
      />
    )
  }

  return (
    <Modal title="Create Lead" isOpen onClose={onClose} maxWidth="max-w-2xl">
      {pricingQuery.isLoading ? (
        <LoadingSpinner />
      ) : pricingQuery.isError ? (
        <ErrorMessage message={getApiErrorMessage(pricingQuery.error)} />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

          {page1Fields.map(renderField)}

          {/* Not a form question: the candidate never picks their own section,
              it is decided by which link they were sent or who is keying them
              in. Sits with the rest of the details all the same, since it is
              part of describing the lead. */}
          {lockSection ? (
            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Section</span>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {sectionLabel || 'Your section'}
              </p>
            </div>
          ) : (
            <Select
              label="Section"
              required
              error={errors.section?.message}
              {...register('section', { required: 'Pick a section' })}
            >
              <option value="">Select…</option>
              {sections.map((section) => (
                <option key={section.code} value={section.code}>
                  {section.label}
                </option>
              ))}
            </Select>
          )}

          {/* The form's page 2. Nothing to show until a program is picked -
              the plans and their prices are the chosen program's, and there is
              no neutral list to offer in the meantime. */}
          {category && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <BookOpen className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                {category.label}
              </p>
              <p className="text-xs text-slate-600">
                Training Fee: {category.training_fee}
                {'   •   '}
                After Placement Fees: {category.after_placement_fee}
              </p>
              <PaymentPlanField
                category={category}
                selected={paymentPlan}
                register={register}
                errors={errors}
                required={false}
                legend="Payment Plan"
              />
            </div>
          )}

          {page3Fields.map(renderField)}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create Lead'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
