import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Link2, Search, XCircle } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Toast } from '@/components/ui/Toast'
import { StatCard } from '@/components/ui/StatCard'
import { DataTable } from '@/components/ui/DataTable'
import { HRStudentDetailModal } from '@/components/hr/HRStudentDetailModal'
import { formatDate } from '@/utils/formatters'

const QUERY_KEY = 'batch-confirmation'

const TABS = [
  { key: 'approved', label: 'Approved by Finance', tone: 'brand' },
  { key: 'group_assigned', label: 'Group Assigned', tone: 'emerald' },
  { key: 'lost', label: 'Lost Students', tone: 'red' },
]

const EMPTY_MESSAGE = {
  approved: 'Nobody is waiting on a group. Leads land here once Finance moves them to Batch Confirmation.',
  group_assigned: 'No students have been added to a WhatsApp group yet.',
  lost: 'No students have been marked Lost.',
}

const dash = (value) => value ?? <span className="text-slate-400">—</span>

// Free-text batch the coordinator types in (27, 28...). Saves on blur or
// Enter rather than per keystroke, and reports failures rather than
// quietly reverting.
function BatchNumberCell({ row, onError }) {
  const queryClient = useQueryClient()
  const saved = row.batch_number ?? ''
  const [value, setValue] = useState(saved)

  const mutation = useMutation({
    mutationFn: (batchNumber) => batchConfirmationService.setBatchNumber(row.id, batchNumber),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (error) => {
      setValue(saved)
      onError(`Couldn't save the batch for ${row.name}: ${getApiErrorMessage(error)}`)
    },
  })

  function commit() {
    if (value.trim() === saved) return
    mutation.mutate(value.trim())
  }

  return (
    <input
      type="text"
      value={value}
      placeholder="e.g. 27"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="w-20 rounded-md border border-slate-200 px-2 py-1 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
  )
}

export function HRCoordinatorPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('approved')
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  // Held between opening the invite link and the coordinator confirming the
  // student actually joined - the open itself proves nothing.
  const [confirming, setConfirming] = useState(null)
  const [viewingStudent, setViewingStudent] = useState(null)

  // Every tab is fetched, not just the active one - the cards show a count, so
  // each tab's total has to be known up front. Switching tabs is then instant,
  // since the data is already in cache.
  const tabQueries = useQueries({
    queries: TABS.map((item) => ({
      queryKey: [QUERY_KEY, 'students', item.key],
      queryFn: () => batchConfirmationService.hrStudents(item.key),
    })),
  })
  const activeIndex = TABS.findIndex((item) => item.key === tab)
  const studentsQuery = tabQueries[activeIndex]
  const linksQuery = useQuery({ queryKey: ['whatsapp-links'], queryFn: batchConfirmationService.whatsappLinks })

  const assignMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.markGroupAssigned(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      setConfirming(null)
    },
    onError: (err) => {
      setError(getApiErrorMessage(err))
      setConfirming(null)
    },
  })

  const linkBySection = Object.fromEntries(
    (linksQuery.data ?? []).map((section) => [section.code, section]),
  )

  function handleGroupAssign(row) {
    const section = row.section ? linkBySection[row.section] : null
    if (!section?.whatsapp_group_url) {
      setError('No WhatsApp Group Link has been configured for this section.')
      return
    }
    window.open(section.whatsapp_group_url, '_blank', 'noopener,noreferrer')
    setConfirming({ row, section })
  }

  const BASE_COLUMNS = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: 'phone', header: 'Phone' },
    { key: 'email', header: 'Email', render: (row) => dash(row.email) },
    { key: 'course_interest', header: 'Course', render: (row) => dash(row.course_interest) },
    {
      key: 'section',
      header: 'Section',
      align: 'center',
      render: (row) => (row.section ? <Badge tone="violet">{row.section.toUpperCase()}</Badge> : dash(null)),
    },
  ]

  const BATCH_COLUMN = {
    key: 'batch_number',
    header: 'Batch',
    align: 'center',
    render: (row) => <BatchNumberCell key={row.id} row={row} onError={setError} />,
  }

  const COLUMNS = {
    approved: [
      ...BASE_COLUMNS,
      BATCH_COLUMN,
      {
        key: 'group_assign',
        header: 'Group Assign',
        align: 'center',
        render: (row) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handleGroupAssign(row)
            }}
            title="Open this section's WhatsApp group"
            aria-label={`Open the WhatsApp group for ${row.name}`}
            className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50"
          >
            <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        ),
      },
    ],
    group_assigned: [
      ...BASE_COLUMNS,
      { key: 'batch_number', header: 'Batch', align: 'center', render: (row) => dash(row.batch_number) },
      {
        key: 'assigned_group',
        header: 'Assigned Group',
        align: 'center',
        render: (row) => dash(row.section ? (linkBySection[row.section]?.label ?? row.section.toUpperCase()) : null),
      },
      {
        key: 'group_assigned_at',
        header: 'Assigned Date',
        align: 'center',
        render: (row) => formatDate(row.group_assigned_at),
      },
      {
        key: 'status',
        header: 'Status',
        align: 'center',
        render: () => (
          <Badge tone="green">
            <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            Group Assigned
          </Badge>
        ),
      },
    ],
    lost: [
      ...BASE_COLUMNS,
      { key: 'lost_reason', header: 'Lost Reason', render: (row) => dash(row.lost_reason) },
      { key: 'lost_at', header: 'Lost Date', align: 'center', render: (row) => formatDate(row.lost_at) },
      {
        key: 'status',
        header: 'Status',
        align: 'center',
        render: () => (
          <Badge tone="red">
            <XCircle className="mr-1 h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            Lost
          </Badge>
        ),
      },
    ],
  }

  const term = search.trim().toLowerCase()
  const allRows = studentsQuery.data ?? []
  const rows = term
    ? allRows.filter((row) =>
        [row.name, row.phone, row.email, row.course_interest, row.batch_number]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : allRows

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        {TABS.map((item, index) => (
          <StatCard
            key={item.key}
            label={item.label}
            value={tabQueries[index].data?.length ?? 0}
            toneName={item.tone}
            isActive={tab === item.key}
            onClick={() => {
              setTab(item.key)
              setSearch('')
            }}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {TABS.find((item) => item.key === tab).label}{' '}
          <span className="font-normal text-slate-400">({rows.length})</span>
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
          columns={COLUMNS[tab]}
          rows={rows}
          isLoading={studentsQuery.isLoading}
          error={studentsQuery.error ? getApiErrorMessage(studentsQuery.error) : null}
          emptyMessage={EMPTY_MESSAGE[tab]}
          onRowClick={(row) => setViewingStudent(row)}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {rows.length} record{rows.length === 1 ? '' : 's'}
      </p>

      {confirming && (
        <Modal title="Confirm group assignment" isOpen onClose={() => setConfirming(null)} maxWidth="max-w-md">
          <p className="text-sm text-slate-700">
            The <span className="font-semibold">{confirming.section.label}</span> WhatsApp group has been opened in a
            new tab. Was <span className="font-semibold">{confirming.row.name}</span> added to it?
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Not yet
            </Button>
            <Button onClick={() => assignMutation.mutate(confirming.row.id)} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Saving…' : 'Yes, added'}
            </Button>
          </div>
        </Modal>
      )}

      {viewingStudent && (
        <HRStudentDetailModal
          student={viewingStudent}
          sectionLabel={viewingStudent.section ? linkBySection[viewingStudent.section]?.label : null}
          onClose={() => setViewingStudent(null)}
        />
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
