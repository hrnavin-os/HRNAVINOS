import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ResourceForm } from '@/components/resource/ResourceForm'

// Edit popup for resources whose form fits ResourceForm's flat field list.
// Loads the record by id first: list DTOs are trimmed (UserListResponse has
// no phone), and seeding the form from the row would show those fields blank
// even when they hold a value.
export function ResourceEditModal({ title, queryKey, service, row, fields, defaults, onSubmit, onClose, submitError }) {
  const { data, isLoading } = useQuery({
    queryKey: [queryKey, 'detail', row.id],
    queryFn: () => service.get(row.id),
  })

  return (
    <Modal title={title} isOpen onClose={onClose}>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <ResourceForm
          fields={fields}
          defaultValues={defaults ? defaults(data ?? row) : (data ?? row)}
          submitLabel="Save Changes"
          onSubmit={onSubmit}
          onCancel={onClose}
          submitError={submitError}
        />
      )}
    </Modal>
  )
}
