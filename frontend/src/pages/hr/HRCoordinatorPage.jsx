import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Search, UserMinus, UserPlus } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { BatchReadinessCard } from '@/components/hr/BatchReadinessCard'

const QUERY_KEY = 'batch-confirmation'

function StatCard({ label, value, tone = 'slate' }) {
  const TONES = {
    slate: 'border-slate-200 bg-white text-slate-900',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    green: 'border-green-200 bg-green-50 text-green-700',
  }
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${TONES[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function PendingLeadRow({ lead, canAllocate, selectedBatch, onAllocate, isAllocating }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
        <p className="truncate text-xs text-slate-500">
          {lead.phone}
          {lead.course_interest && ` · ${lead.course_interest}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={lead.fully_paid ? 'green' : 'amber'}>
            {lead.fully_paid
              ? 'Fees cleared'
              : lead.total_installments
                ? `${lead.paid_installments}/${lead.total_installments} paid`
                : 'Unpaid'}
          </Badge>
          {lead.section && <Badge tone="violet">{lead.section.toUpperCase()}</Badge>}
          {!lead.email && <Badge tone="red">No email</Badge>}
        </div>
      </div>
      {canAllocate && (
        <Button
          variant="secondary"
          disabled={!selectedBatch || isAllocating}
          onClick={onAllocate}
          title={selectedBatch ? `Allocate to ${selectedBatch.batch_name}` : 'Select a batch first'}
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Allocate
        </Button>
      )}
    </div>
  )
}

export function HRCoordinatorPage() {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [selectedBatchId, setSelectedBatchId] = useState(null)
  const [search, setSearch] = useState('')
  const [banner, setBanner] = useState(null)

  const canAllocate = hasPermission(PERMISSIONS.BATCH_CONFIRMATION_ALLOCATE)
  const canConfirm = hasPermission(PERMISSIONS.BATCH_CONFIRMATION_CONFIRM)

  const summaryQuery = useQuery({ queryKey: [QUERY_KEY, 'summary'], queryFn: batchConfirmationService.summary })
  const leadsQuery = useQuery({ queryKey: [QUERY_KEY, 'pending'], queryFn: batchConfirmationService.pendingLeads })
  const batchesQuery = useQuery({ queryKey: [QUERY_KEY, 'batches'], queryFn: batchConfirmationService.batches })
  const detailQuery = useQuery({
    queryKey: [QUERY_KEY, 'batch', selectedBatchId],
    queryFn: () => batchConfirmationService.batch(selectedBatchId),
    enabled: Boolean(selectedBatchId),
  })

  // Allocating changes the queue, the batch's roster and every counter at once,
  // so each mutation refreshes the whole module rather than patching caches.
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })

  const allocateMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.allocate({ lead_id: leadId, batch_id: selectedBatchId }),
    onSuccess: () => {
      setBanner(null)
      refreshAll()
    },
    onError: (error) => setBanner({ tone: 'error', text: getApiErrorMessage(error) }),
  })

  const withdrawMutation = useMutation({
    mutationFn: (allocationId) => batchConfirmationService.withdraw(allocationId, null),
    onSuccess: () => {
      setBanner(null)
      refreshAll()
    },
    onError: (error) => setBanner({ tone: 'error', text: getApiErrorMessage(error) }),
  })

  const confirmMutation = useMutation({
    mutationFn: (batchId) => batchConfirmationService.confirm(batchId),
    onSuccess: (data) => {
      setBanner({ tone: 'success', text: data.message })
      refreshAll()
    },
    onError: (error) => setBanner({ tone: 'error', text: getApiErrorMessage(error) }),
  })

  const summary = summaryQuery.data
  const batches = batchesQuery.data ?? []
  const selectedBatch = batches.find((batch) => batch.batch_id === selectedBatchId) ?? null
  const roster = detailQuery.data?.allocations ?? []

  const leads = (leadsQuery.data ?? []).filter((lead) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [lead.name, lead.phone, lead.email, lead.course_interest]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(term))
  })

  if (summaryQuery.isLoading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">HR Coordinator</h1>
        <p className="mt-1 text-sm text-slate-500">
          Place financially approved leads into batches, then lock the roster to enrol them as students.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Awaiting Seat" value={summary?.pending_allocation ?? 0} tone="brand" />
        <StatCard label="Allocated" value={summary?.allocated_awaiting_confirmation ?? 0} tone="amber" />
        <StatCard label="Ready to Confirm" value={summary?.batches_ready_to_confirm ?? 0} tone="green" />
        <StatCard label="Batches Confirmed" value={summary?.batches_confirmed ?? 0} />
        <StatCard label="Students Placed" value={summary?.students_placed ?? 0} />
      </div>

      {banner && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${
            banner.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {banner.tone === 'success' && (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- Allocation queue ---------- */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Allocation Queue <span className="font-normal text-slate-400">({leads.length})</span>
            </h2>
          </div>

          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Search by name, phone, course…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {leadsQuery.isLoading ? (
              <LoadingSpinner />
            ) : leadsQuery.error ? (
              <div className="p-4">
                <ErrorMessage message={getApiErrorMessage(leadsQuery.error)} />
              </div>
            ) : leads.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                No leads waiting for a seat. Leads appear here once they reach the Batch Confirmation stage.
              </p>
            ) : (
              leads.map((lead) => (
                <PendingLeadRow
                  key={lead.id}
                  lead={lead}
                  canAllocate={canAllocate}
                  selectedBatch={selectedBatch}
                  isAllocating={allocateMutation.isPending}
                  onAllocate={() => allocateMutation.mutate(lead.id)}
                />
              ))
            )}
          </div>

          {!selectedBatch && leads.length > 0 && canAllocate && (
            <p className="mt-2 text-xs text-slate-400">Select a batch on the right to start allocating.</p>
          )}
        </section>

        {/* ---------- Batches + roster ---------- */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Batches <span className="font-normal text-slate-400">({batches.length})</span>
          </h2>

          {batchesQuery.isLoading ? (
            <LoadingSpinner />
          ) : batches.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No upcoming batches. Create one under Batches first.
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <BatchReadinessCard
                  key={batch.batch_id}
                  batch={batch}
                  isSelected={batch.batch_id === selectedBatchId}
                  canConfirm={canConfirm}
                  isConfirming={confirmMutation.isPending}
                  onSelect={() => setSelectedBatchId(batch.batch_id === selectedBatchId ? null : batch.batch_id)}
                  onConfirm={() => confirmMutation.mutate(batch.batch_id)}
                />
              ))}
            </div>
          )}

          {selectedBatchId && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Roster <span className="font-normal text-slate-400">({roster.length})</span>
              </h3>
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                {detailQuery.isLoading ? (
                  <LoadingSpinner />
                ) : roster.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">
                    No one allocated yet. Pick leads from the queue on the left.
                  </p>
                ) : (
                  roster.map((seat) => (
                    <div
                      key={seat.allocation_id}
                      className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-900">{seat.name}</p>
                        <p className="truncate text-xs text-slate-500">{seat.email ?? seat.phone}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={seat.fully_paid ? 'green' : 'amber'}>
                          {seat.fully_paid ? 'Paid' : 'Pending'}
                        </Badge>
                        {seat.status === 'confirmed' ? (
                          <Badge tone="blue">Enrolled</Badge>
                        ) : (
                          canAllocate && (
                            <button
                              type="button"
                              onClick={() => withdrawMutation.mutate(seat.allocation_id)}
                              disabled={withdrawMutation.isPending}
                              title="Withdraw from batch"
                              aria-label="Withdraw from batch"
                              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            >
                              <UserMinus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
