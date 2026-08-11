import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { getApiErrorMessage } from '@/services/apiClient'

// Read-only detail popup behind the eye icon. Refetches the record by id
// rather than reusing the row: list endpoints return trimmed DTOs (e.g.
// UserListResponse has no phone, last_login_at or timestamps), so the row
// alone can't fill this out. Falls back to the row while loading/on error.
// `renderBody(record)` replaces the default label/value list for pages that
// need a purpose-built layout, while keeping the refetch, loading and error
// handling below - mirrors how rowActions.edit accepts its own `render`.
export function ResourceViewModal({ title, queryKey, service, row, fields, onClose, maxWidth, renderBody }) {
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
          {renderBody ? renderBody(record) : (
          <dl className="divide-y divide-slate-100">
            {fields.map((field) => {
              const value = field.value(record)
              const rendered = value === null || value === undefined || value === '' ? '—' : value

              return (
                // Label above value on a phone. Side by side, a third of a
                // 330px modal leaves the value about 200px wide, so anything
                // longer than a date wrapped to three or four lines.
                <div key={field.label} className="grid grid-cols-1 gap-x-3 py-2.5 sm:grid-cols-3">
                  <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
                  <dd className="text-sm break-words text-slate-900 sm:col-span-2">{rendered}</dd>
                </div>
              )
            })}
          </dl>
          )}
        </>
      )}
    </Modal>
  )
}
