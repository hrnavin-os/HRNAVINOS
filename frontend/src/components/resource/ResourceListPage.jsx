import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ResourceForm } from '@/components/resource/ResourceForm'

// Shared "list + search + paginate + create" page shell used by every
// straightforward CRUD module (Courses, Batches, Tutors, Placements, ...).
export function ResourceListPage({
  title,
  description,
  queryKey,
  service,
  columns,
  createFields,
  createPermission,
  transformCreatePayload = (values) => values,
  extraParams = {},
  // For creation flows too complex for ResourceForm's simple field list
  // (e.g. grouped permission checkboxes) - fully replaces the built-in
  // "+ New" button and modal. Receives { onCreated } to invalidate the list.
  renderCreateAction,
}) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { items, total, page, setPage, search, setSearch, isLoading, error, totalPages } = usePaginatedQuery(
    queryKey,
    service,
    extraParams,
  )

  const createMutation = useMutation({
    mutationFn: (values) => service.create(transformCreatePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setIsModalOpen(false)
    },
  })

  const canCreate = !createPermission || hasPermission(createPermission)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {renderCreateAction
          ? renderCreateAction({ onCreated: () => queryClient.invalidateQueries({ queryKey: [queryKey] }) })
          : canCreate && createFields && <Button onClick={() => setIsModalOpen(true)}>+ New</Button>}
      </div>

      <div className="mb-4 max-w-xs">
        <Input placeholder="Search..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable columns={columns} rows={items} isLoading={isLoading} error={error} />
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
      <p className="mt-2 text-xs text-slate-400">{total} total record{total === 1 ? '' : 's'}</p>

      {createFields && (
        <Modal title={`New ${title}`} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <ResourceForm
            fields={createFields}
            onSubmit={(values) => createMutation.mutateAsync(values)}
            onCancel={() => setIsModalOpen(false)}
            submitError={createMutation.error ? getApiErrorMessage(createMutation.error) : null}
          />
        </Modal>
      )}
    </div>
  )
}
