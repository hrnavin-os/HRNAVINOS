import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { getApiErrorMessage } from '@/services/apiClient'

// Read-only detail popup behind the eye icon. Refetches the record by id
// rather than reusing the row: list endpoints return trimmed DTOs (e.g.
// UserListResponse has no phone, last_login_at or timestamps), so the row
// alone can't fill this out. Falls back to the row while loading/on error.
export function ResourceViewModal({ title, queryKey, service, row, fields, onClose, maxWidth }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [queryKey, 'detail', row.id],
    queryFn: () => service.get(row.id),
  })

  const record = data ?? row

  return (
    <Modal title={title} isOpen onClose={onClose} maxWidth={maxWidth}>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {error && <ErrorMessage message={getApiErrorMessage(error)} />}
          <dl className="divide-y divide-slate-100">
            {fields.map((field) => {
              const value = field.value(record)
              const rendered = value === null || value === undefined || value === '' ? '—' : value

              // `fullWidth` stacks the label above a value that spans the whole
              // modal, for content the 2/3 column would cramp (e.g. a pricing
              // breakdown). Everything else keeps the label/value pair layout.
              if (field.fullWidth) {
                return (
                  <div key={field.label} className="py-3">
                    <dt className="mb-2 text-sm font-medium text-slate-500">{field.label}</dt>
                    <dd className="text-sm break-words text-slate-900">{rendered}</dd>
                  </div>
                )
              }

              return (
                <div key={field.label} className="grid grid-cols-3 gap-3 py-2.5">
                  <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
                  <dd className="col-span-2 text-sm break-words text-slate-900">{rendered}</dd>
                </div>
              )
            })}
          </dl>
        </>
      )}
    </Modal>
  )
}
