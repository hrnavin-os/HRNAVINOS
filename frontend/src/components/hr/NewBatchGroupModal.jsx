import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ResourceForm } from '@/components/resource/ResourceForm'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'

// Forming the group is the coordinator's own job, so the batch is created
// here rather than sending them to the Batches page. Course and tutor come
// from this module's own /options endpoint, which resolves tutor names -
// TutorResponse only carries user_id, and reading users needs a permission
// the HR Coordinator role doesn't hold.
export function NewBatchGroupModal({ onClose, onSubmit, error }) {
  const { data, isLoading } = useQuery({
    queryKey: ['batch-confirmation', 'options'],
    queryFn: batchConfirmationService.options,
  })

  const fields = [
    { name: 'name', label: 'Batch Name', placeholder: 'e.g. Morning Batch — Aug', required: true },
    {
      name: 'course_id',
      label: 'Course',
      type: 'select',
      required: true,
      options: (data?.courses ?? []).map((course) => ({ value: course.id, label: course.label })),
    },
    {
      name: 'tutor_id',
      label: 'Tutor',
      type: 'select',
      // Optional on the API, but a batch can't be confirmed without one -
      // asking now saves a round trip through the readiness checklist.
      options: (data?.tutors ?? []).map((tutor) => ({
        value: tutor.id,
        label: tutor.detail ? `${tutor.label} — ${tutor.detail}` : tutor.label,
      })),
    },
    { name: 'start_date', label: 'Start Date', type: 'date', required: true },
    { name: 'end_date', label: 'End Date', type: 'date', required: true },
    { name: 'schedule', label: 'Schedule', placeholder: 'e.g. Mon–Fri, 10am–1pm' },
    { name: 'capacity', label: 'Capacity', type: 'number', required: true },
  ]

  return (
    <Modal title="New Batch Group" isOpen onClose={onClose}>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <ResourceForm
          fields={fields}
          defaultValues={{ capacity: 30 }}
          submitLabel="Create Batch"
          onSubmit={onSubmit}
          onCancel={onClose}
          submitError={error ? getApiErrorMessage(error) : null}
        />
      )}
    </Modal>
  )
}
