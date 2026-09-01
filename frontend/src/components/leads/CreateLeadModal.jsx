import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'

/**
 * Hand-keys a lead straight onto the Foundation board.
 *
 * Most leads still arrive through the Form Collection forms, but a walk-in or
 * a phone enquiry has nobody to fill one in - they were previously added by
 * asking the candidate to submit the public form on someone else's behalf.
 *
 * Only what the board needs to show a usable row: everything else (payment
 * plan, stage, remarks) is edited inline on the row itself afterwards, so
 * asking for it here would just be a second place to get it wrong.
 */
export function CreateLeadModal({ sections, courses, defaultSection, lockSection, onClose }) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
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

  function onSubmit(values) {
    mutation.mutate({
      name: values.name.trim(),
      phone: values.phone.trim(),
      // An empty string here would fail the API's email validation, and "no
      // email given" is a normal state for a phone enquiry.
      email: values.email?.trim() || null,
      course_interest: values.course_interest,
      // A section-scoped user's own section is forced by the backend anyway;
      // sending it keeps the two agreeing on what was just created.
      section: lockSection ? defaultSection : values.section || null,
      notes: values.notes?.trim() || null,
    })
  }

  const sectionLabel = sections.find((section) => section.code === defaultSection)?.label ?? defaultSection

  return (
    <Modal title="Create Lead" isOpen onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

        <Input
          label="Name"
          required
          autoFocus
          placeholder="Candidate's full name"
          error={errors.name?.message}
          {...register('name', {
            required: 'Name is required',
            minLength: { value: 2, message: 'Name is too short' },
          })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Mobile Number"
            required
            type="tel"
            placeholder="10-digit mobile number"
            error={errors.phone?.message}
            {...register('phone', {
              required: 'Mobile number is required',
              minLength: { value: 6, message: 'Mobile number is too short' },
            })}
          />
          <Input label="Email" type="email" placeholder="Optional" {...register('email')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Locked for a Section Admin, who can only ever create in their own
              section - shown rather than hidden so it's clear where the lead
              is going to land. */}
          {lockSection ? (
            <div className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Section</span>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {sectionLabel || 'Your section'}
              </p>
            </div>
          ) : (
            <Select label="Section" required error={errors.section?.message} {...register('section', { required: 'Pick a section' })}>
              <option value="">Select…</option>
              {sections.map((section) => (
                <option key={section.code} value={section.code}>
                  {section.label}
                </option>
              ))}
            </Select>
          )}

          {/* Same list the row's Course cell offers, and typing a new one is
              off here for the same reason: the board and the analytics both
              group on this string. */}
          <Select
            label="Course"
            required
            error={errors.course_interest?.message}
            {...register('course_interest', { required: 'Pick a course' })}
          >
            <option value="">Select…</option>
            {courses.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </Select>
        </div>

        <Textarea
          label="Query"
          rows={3}
          placeholder="Anything the candidate asked about (optional)"
          {...register('notes')}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Lead'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
