import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/formatters'

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

function paymentBadge(lead) {
  if (lead.fully_paid) return <Badge tone="green">Fees cleared</Badge>
  if (lead.total_installments) {
    return (
      <Badge tone="amber">
        {lead.paid_installments}/{lead.total_installments} paid
      </Badge>
    )
  }
  return <Badge tone="slate">Unpaid</Badge>
}

const columns = [
  { key: 'name', header: 'Name', render: (lead) => <span className="font-medium text-slate-900">{lead.name}</span> },
  { key: 'phone', header: 'Ph.No' },
  { key: 'email', header: 'Email', render: (lead) => lead.email ?? <span className="text-slate-400">—</span> },
  {
    key: 'course_interest',
    header: 'Course',
    render: (lead) => lead.course_interest ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'section',
    header: 'Section',
    render: (lead) => (lead.section ? <Badge tone="violet">{lead.section.toUpperCase()}</Badge> : '—'),
  },
  { key: 'payment', header: 'Payment', render: paymentBadge },
  { key: 'created_at', header: 'Added', render: (lead) => formatDate(lead.created_at) },
]

export function HRCoordinatorPage() {
  const [search, setSearch] = useState('')

  const summaryQuery = useQuery({ queryKey: [QUERY_KEY, 'summary'], queryFn: batchConfirmationService.summary })
  const leadsQuery = useQuery({ queryKey: [QUERY_KEY, 'pending'], queryFn: batchConfirmationService.pendingLeads })

  const summary = summaryQuery.data

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
          Financially approved leads waiting to be grouped into a batch.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Awaiting Seat" value={summary?.pending_allocation ?? 0} tone="brand" />
        <StatCard label="Allocated" value={summary?.allocated_awaiting_confirmation ?? 0} tone="amber" />
        <StatCard label="Ready to Confirm" value={summary?.batches_ready_to_confirm ?? 0} tone="green" />
        <StatCard label="Batches Confirmed" value={summary?.batches_confirmed ?? 0} />
        <StatCard label="Total Students" value={summary?.students_placed ?? 0} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Allocation Queue <span className="font-normal text-slate-400">({leads.length})</span>
        </h2>
        <div className="relative w-full max-w-xs">
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
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable
          columns={columns}
          rows={leads}
          isLoading={leadsQuery.isLoading}
          error={leadsQuery.error ? getApiErrorMessage(leadsQuery.error) : null}
          emptyMessage="No leads waiting for a batch. They appear here once they reach the Batch Confirmation stage."
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {leads.length} record{leads.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}
