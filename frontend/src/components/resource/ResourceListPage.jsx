import { useState } from 'react'
import { Search } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ResourceForm } from '@/components/resource/ResourceForm'
import { RowActions } from '@/components/resource/RowActions'
import { ResourceViewModal } from '@/components/resource/ResourceViewModal'
import { ResourceEditModal } from '@/components/resource/ResourceEditModal'
import { ConfirmDeleteModal } from '@/components/resource/ConfirmDeleteModal'

// Shared "list + search + paginate + create" page shell used by every
// straightforward CRUD module (Courses, Batches, Tutors, Placements, ...).
export function ResourceListPage({
  // Still used for the "New {title}" create-modal heading, even though the
  // page itself no longer renders a title.
  title,
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
  // Opt-in per-row View / Edit / Delete column. Omit it and the table renders
  // exactly as before, so pages that don't ask for actions don't get them.
  //   view:   { title?, fields: [{ label, value(record) }] }
  //   edit:   { title?, permission?, fields, defaults?, transform? }
  //           or { title?, permission?, render({ row, onClose, onSaved }) }
  //   remove: { permission?, describe(row), lockedReason?(row) }
  //   lockedReason?(row) -> string disables BOTH edit and delete with a tooltip
  rowActions,
  // Opt-in leading "S.No" column. Numbers run across the whole result set
  // rather than restarting at 1 on every page.
  serialNumber = false,
  // Swaps the table for a responsive card grid, keeping search, pagination,
  // the create flow and every row-action modal untouched. Receives
  // ({ row, index, actions }) where `actions` is the ready-made
  // View/Edit/Delete control, already permission-filtered - so a card decides
  // where the buttons sit without re-deriving who may press them.
  renderCard,
  // Extra filter controls rendered inline beside the search box.
  renderFilters,
}) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewingRow, setViewingRow] = useState(null)
  const [editingRow, setEditingRow] = useState(null)
  const [deletingRow, setDeletingRow] = useState(null)

  const { items, total, page, pageSize, setPage, search, setSearch, isLoading, error, totalPages } =
    usePaginatedQuery(queryKey, service, extraParams)

  const createMutation = useMutation({
    mutationFn: (values) => service.create(transformCreatePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setIsModalOpen(false)
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => service.update(id, values),
    onSuccess: () => {
      invalidate()
      setEditingRow(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => service.remove(id),
    onSuccess: () => {
      invalidate()
      setDeletingRow(null)
    },
  })

  const canCreate = !createPermission || hasPermission(createPermission)
  const canEdit = Boolean(rowActions?.edit) && (!rowActions.edit.permission || hasPermission(rowActions.edit.permission))
  const canDelete =
    Boolean(rowActions?.remove) && (!rowActions.remove.permission || hasPermission(rowActions.remove.permission))

  // Clear any previous failure before reopening, so a 403 from one row doesn't
  // greet you on the next.
  function openEdit(row) {
    updateMutation.reset()
    setEditingRow(row)
  }

  function openDelete(row) {
    deleteMutation.reset()
    setDeletingRow(row)
  }

  // Nothing this user is allowed to do -> don't render a dead column.
  const hasRowActions = Boolean(rowActions) && (Boolean(rowActions.view) || canEdit || canDelete)

  const serialColumn = {
    key: '__sno',
    header: 'S.No',
    // `index` is page-local, so offset it to keep numbering continuous:
    // page 2 of a 20-per-page list starts at 21, not 1.
    render: (_row, index) => (page - 1) * pageSize + index + 1,
  }

  // Shared by the table's Actions column and by renderCard, so a card gets the
  // same permission-filtered controls without repeating any of this.
  const rowActionsFor = (row) =>
    hasRowActions ? (
      <RowActions
        onView={rowActions.view ? () => setViewingRow(row) : undefined}
        onEdit={canEdit ? () => openEdit(row) : undefined}
        onDelete={canDelete ? () => openDelete(row) : undefined}
        lockedReason={rowActions.lockedReason?.(row) ?? null}
        deleteLockedReason={rowActions.remove?.lockedReason?.(row) ?? null}
      />
    ) : null

  const actionsColumn = {
    key: '__actions',
    header: 'Actions',
    render: (row) => rowActionsFor(row),
  }

  const tableColumns = [
    ...(serialNumber ? [serialColumn] : []),
    ...columns,
    ...(hasRowActions ? [actionsColumn] : []),
  ]

  return (
    <div>
      {/* No page heading here: the Topbar already renders the current page's
          name from NAV_LEAF_ITEMS, so an <h1> repeated it directly underneath.
          Search and the create action share the top row instead. */}
      {/* Search, filters and the create action share one toolbar card, so the
          controls read as a single band above the table rather than three
          things floating on the page background. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-56 shrink-0">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              rightElement={<Search className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />}
            />
          </div>
          {/* Filters sit on the same row as search rather than a band above it -
              they're the same job, and two stacked rows pushed the table down.
              The rule separates "find by text" from "narrow by value". */}
          {renderFilters && <span className="hidden h-7 w-px shrink-0 bg-slate-200 lg:block" />}
          {renderFilters?.()}
          <div className="ml-auto">
            {renderCreateAction
              ? renderCreateAction({ onCreated: () => queryClient.invalidateQueries({ queryKey: [queryKey] }) })
              : canCreate && createFields && <Button onClick={() => setIsModalOpen(true)}>+ New</Button>}
          </div>
        </div>
      </div>

      {renderCard ? (
        <div>
          {isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-white py-10 shadow-sm">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <ErrorMessage message={error} />
            </div>
          ) : !items.length ? (
            <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              No records found.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((row, index) => (
                <div key={row.id}>{renderCard({ row, index, actions: rowActionsFor(row) })}</div>
              ))}
            </div>
          )}
          {/* Card mode has no card to sit inside, so the footer gets its own.
              Skipped entirely when there's nothing to count, otherwise an
              empty bordered strip hangs under the empty state. */}
          {items.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white shadow-sm">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                total={total}
                pageSize={pageSize}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable columns={tableColumns} rows={items} isLoading={isLoading} error={error} />
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            pageSize={pageSize}
          />
        </div>
      )}

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

      {viewingRow && rowActions?.view && (
        <ResourceViewModal
          title={rowActions.view.title?.(viewingRow) ?? 'Details'}
          queryKey={queryKey}
          service={service}
          row={viewingRow}
          fields={rowActions.view.fields}
          maxWidth={rowActions.view.maxWidth}
          renderBody={rowActions.view.renderBody}
          onClose={() => setViewingRow(null)}
        />
      )}

      {editingRow &&
        (rowActions.edit.render ? (
          rowActions.edit.render({
            row: editingRow,
            onClose: () => setEditingRow(null),
            onSaved: () => {
              invalidate()
              setEditingRow(null)
            },
          })
        ) : (
          <ResourceEditModal
            title={rowActions.edit.title?.(editingRow) ?? 'Edit'}
            queryKey={queryKey}
            service={service}
            row={editingRow}
            fields={rowActions.edit.fields}
            defaults={rowActions.edit.defaults}
            onSubmit={(values) =>
              updateMutation.mutateAsync({
                id: editingRow.id,
                values: rowActions.edit.transform ? rowActions.edit.transform(values) : values,
              })
            }
            onClose={() => setEditingRow(null)}
            submitError={updateMutation.error ? getApiErrorMessage(updateMutation.error) : null}
          />
        ))}

      {deletingRow && (
        <ConfirmDeleteModal
          describe={rowActions.remove.describe(deletingRow)}
          error={deleteMutation.error ? getApiErrorMessage(deleteMutation.error) : null}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingRow.id)}
          onClose={() => setDeletingRow(null)}
        />
      )}
    </div>
  )
}
