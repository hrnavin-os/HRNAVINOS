import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Eye, Search } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/formatters'
import { StudentDetailModal } from '@/components/hr/StudentDetailModal'

const QUERY_KEY = 'batch-confirmation'

// Each stat card is also the table's filter: clicking one swaps in that
// view's own dataset and columns, so the number you clicked always matches
// the number of rows you get.
const VIEWS = {
  awaiting: { label: 'Awaiting Seat', tone: 'brand', summaryKey: 'pending_allocation' },
  allocated: { label: 'Allocated', tone: 'amber', summaryKey: 'allocated_awaiting_confirmation' },
  ready: { label: 'Ready to Confirm', tone: 'green', summaryKey: 'batches_ready_to_confirm' },
  confirmed: { label: 'Batches Confirmed', tone: 'slate', summaryKey: 'batches_confirmed' },
  students: { label: 'Total Students', tone: 'slate', summaryKey: 'students_placed' },
}

const TONES = {
  slate: { idle: 'border-slate-200 bg-white text-slate-900', active: 'border-slate-400 bg-slate-100 text-slate-900' },
  brand: { idle: 'border-brand-200 bg-brand-50 text-brand-700', active: 'border-brand-500 bg-brand-100 text-brand-800' },
  amber: { idle: 'border-amber-200 bg-amber-50 text-amber-700', active: 'border-amber-500 bg-amber-100 text-amber-800' },
  green: { idle: 'border-green-200 bg-green-50 text-green-700', active: 'border-green-500 bg-green-100 text-green-800' },
}

function StatCard({ label, value, tone, isActive, onClick }) {
  const palette = TONES[tone] ?? TONES.slate
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-lg border p-4 text-left shadow-sm transition-colors ${
        isActive ? `${palette.active} ring-1 ring-inset` : `${palette.idle} hover:border-slate-300`
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </button>
  )
}

function paymentBadge(row) {
  if (row.fully_paid) return <Badge tone="green">Fees cleared</Badge>
  if (row.total_installments) {
    return (
      <Badge tone="amber">
        {row.paid_installments}/{row.total_installments} paid
      </Badge>
    )
  }
  return <Badge tone="slate">Unpaid</Badge>
}

const dash = (value) => value ?? <span className="text-slate-400">—</span>

export function HRCoordinatorPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('awaiting')
  const [search, setSearch] = useState('')
  const [viewingRecord, setViewingRecord] = useState(null)

  const summaryQuery = useQuery({ queryKey: [QUERY_KEY, 'summary'], queryFn: batchConfirmationService.summary })
  const leadsQuery = useQuery({ queryKey: [QUERY_KEY, 'pending'], queryFn: batchConfirmationService.pendingLeads })
  const batchesQuery = useQuery({ queryKey: [QUERY_KEY, 'batches'], queryFn: batchConfirmationService.batches })
  const allocatedQuery = useQuery({
    queryKey: [QUERY_KEY, 'allocations', 'allocated'],
    queryFn: () => batchConfirmationService.allocations('allocated'),
  })
  const studentsQuery = useQuery({
    queryKey: [QUERY_KEY, 'allocations', 'confirmed'],
    queryFn: () => batchConfirmationService.allocations('confirmed'),
  })

  const markMutation = useMutation({
    mutationFn: ({ leadId, marked }) => batchConfirmationService.markLead(leadId, marked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })

  const summary = summaryQuery.data
  const batches = batchesQuery.data ?? []

  const markCell = (row) => {
    const isMarked = row.hr_marked
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          markMutation.mutate({ leadId: row.id, marked: !isMarked })
        }}
        disabled={markMutation.isPending}
        title={isMarked ? 'Clear mark' : 'Mark as handled'}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
          isMarked
            ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        {isMarked ? 'Marked' : 'Mark'}
      </button>
    )
  }

  const eyeCell = (row) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        setViewingRecord(row)
      }}
      title="View details"
      aria-label="View details"
      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  )

  const NAME_COLUMN = {
    key: 'name',
    header: 'Name',
    render: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
  }

  const VIEW_CONFIG = {
    awaiting: {
      rows: leadsQuery.data ?? [],
      query: leadsQuery,
      empty: 'No leads waiting for a batch. They appear here once they reach the Batch Confirmation stage.',
      searchOn: (row) => [row.name, row.phone, row.email, row.course_interest],
      columns: [
        NAME_COLUMN,
        { key: 'phone', header: 'Ph.No' },
        { key: 'email', header: 'Email', render: (row) => dash(row.email) },
        { key: 'course_interest', header: 'Course', render: (row) => dash(row.course_interest) },
        {
          key: 'section',
          header: 'Section',
          render: (row) => (row.section ? <Badge tone="violet">{row.section.toUpperCase()}</Badge> : dash(null)),
        },
        { key: 'payment', header: 'Payment', render: paymentBadge },
        { key: 'created_at', header: 'Added', render: (row) => formatDate(row.created_at) },
        {
          key: 'actions',
          header: 'Actions',
          render: (row) => (
            <div className="flex items-center gap-2">
              {eyeCell(row)}
              {markCell(row)}
            </div>
          ),
        },
      ],
    },
    allocated: {
      rows: allocatedQuery.data ?? [],
      query: allocatedQuery,
      empty: 'No one is holding a seat yet.',
      searchOn: (row) => [row.name, row.phone, row.email, row.batch_name],
      columns: [
        NAME_COLUMN,
        { key: 'phone', header: 'Ph.No' },
        { key: 'batch_name', header: 'Batch' },
        { key: 'course_interest', header: 'Course', render: (row) => dash(row.course_interest) },
        { key: 'payment', header: 'Payment', render: paymentBadge },
        { key: 'allocated_at', header: 'Allocated', render: (row) => formatDate(row.allocated_at) },
        { key: 'actions', header: 'Actions', render: eyeCell },
      ],
    },
    students: {
      rows: studentsQuery.data ?? [],
      query: studentsQuery,
      empty: 'No students enrolled yet. Confirming a batch enrols everyone on its roster.',
      searchOn: (row) => [row.name, row.phone, row.email, row.batch_name],
      columns: [
        NAME_COLUMN,
        { key: 'phone', header: 'Ph.No' },
        { key: 'email', header: 'Email', render: (row) => dash(row.email) },
        { key: 'batch_name', header: 'Batch' },
        { key: 'confirmed_at', header: 'Enrolled', render: (row) => formatDate(row.confirmed_at) },
        { key: 'actions', header: 'Actions', render: eyeCell },
      ],
    },
  }

  // The two batch-shaped views share their columns; only the filter differs.
  const BATCH_COLUMNS = [
    { key: 'batch_name', header: 'Batch', render: (row) => <span className="font-medium text-slate-900">{row.batch_name}</span> },
    { key: 'course_name', header: 'Course', render: (row) => dash(row.course_name) },
    { key: 'tutor_name', header: 'Tutor', render: (row) => dash(row.tutor_name) },
    { key: 'allocated_count', header: 'Allocated', render: (row) => `${row.allocated_count} / ${row.capacity}` },
    { key: 'paid_count', header: 'Fees Cleared', render: (row) => `${row.paid_count} / ${row.allocated_count}` },
    { key: 'start_date', header: 'Starts', render: (row) => formatDate(row.start_date) },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={row.status === 'confirmed' ? 'green' : 'amber'}>{row.status}</Badge> },
  ]

  VIEW_CONFIG.ready = {
    rows: batches.filter((batch) => batch.can_confirm),
    query: batchesQuery,
    empty: 'No batch is ready to confirm yet.',
    searchOn: (row) => [row.batch_name, row.course_name, row.tutor_name],
    columns: BATCH_COLUMNS,
  }
  VIEW_CONFIG.confirmed = {
    rows: batches.filter((batch) => batch.status === 'confirmed'),
    query: batchesQuery,
    empty: 'No batch has been confirmed yet.',
    searchOn: (row) => [row.batch_name, row.course_name, row.tutor_name],
    columns: BATCH_COLUMNS,
  }

  const active = VIEW_CONFIG[view]
  const term = search.trim().toLowerCase()
  const rows = term
    ? active.rows.filter((row) =>
        active
          .searchOn(row)
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : active.rows

  if (summaryQuery.isLoading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">HR Coordinator</h1>
        <p className="mt-1 text-sm text-slate-500">
          Financially approved leads waiting to be grouped into a batch. Select a card to filter the list.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Object.entries(VIEWS).map(([key, config]) => (
          <StatCard
            key={key}
            label={config.label}
            value={summary?.[config.summaryKey] ?? 0}
            tone={config.tone}
            isActive={view === key}
            onClick={() => {
              setView(key)
              setSearch('')
            }}
          />
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {VIEWS[view].label} <span className="font-normal text-slate-400">({rows.length})</span>
        </h2>
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable
          columns={active.columns}
          rows={rows}
          isLoading={active.query.isLoading}
          error={active.query.error ? getApiErrorMessage(active.query.error) : null}
          emptyMessage={active.empty}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {rows.length} record{rows.length === 1 ? '' : 's'}
      </p>

      {viewingRecord && (
        <StudentDetailModal record={viewingRecord} onClose={() => setViewingRecord(null)} />
      )}
    </div>
  )
}
