import { useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Check, Search, Send, UserX, Users, XCircle } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'
import { StatCard } from '@/components/ui/StatCard'
import { DataTable } from '@/components/ui/DataTable'
import { HRStudentDetailModal } from '@/components/hr/HRStudentDetailModal'
import { formatDate } from '@/utils/formatters'

const QUERY_KEY = 'batch-confirmation'

const TABS = [
  { key: 'approved', label: 'Approved by Finance', tone: 'brand', icon: BadgeCheck },
  { key: 'group_assigned', label: 'Group Assigned', tone: 'emerald', icon: Users },
  { key: 'lost', label: 'Lost Students', tone: 'red', icon: UserX },
]

const EMPTY_MESSAGE = {
  approved: 'Nobody is waiting on a group. Leads land here once Finance moves them to Batch Confirmation.',
  group_assigned: 'No students have been added to a WhatsApp group yet.',
  lost: 'No students have been marked Lost.',
}

const dash = (value) => value ?? <span className="text-slate-400">—</span>

// wa.me wants digits only, with a country code. A stored Indian number is the
// bare 10 digits, so it gets the 91 that WhatsApp needs to route it.
function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 10 ? `91${digits}` : digits
}

// The invite the coordinator sends. WhatsApp has no way for one account to add
// another to a group - only the person themselves can accept an invite - so
// "add them to the group" is, on this platform, sending them the join link.
function inviteMessage(name, groupUrl) {
  return `Hi ${name}, welcome to HRNAVINOS! Join your batch group here: ${groupUrl}`
}

export function HRCoordinatorPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('approved')
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [selected, setSelected] = useState([])
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })

  const assignMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.markGroupAssigned(leadId),
    onSuccess: (_data, leadId) => {
      invalidate()
      // No confirmation dialog before the fact - the undo here is what makes a
      // single click safe, and it costs nothing in the common case where the
      // coordinator meant it.
      setNotice({
        message: 'Marked as added to the group.',
        action: { label: 'Undo', onClick: () => undoMutation.mutate(leadId) },
      })
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const undoMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.markGroupAssigned(leadId, false),
    onSuccess: invalidate,
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const bulkMutation = useMutation({
    mutationFn: (leadIds) => batchConfirmationService.markGroupAssignedBulk(leadIds),
    onSuccess: (data) => {
      invalidate()
      setSelected([])
      setNotice({ message: data.message })
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  })

  const linkBySection = Object.fromEntries(
    (linksQuery.data ?? []).map((section) => [section.code, section]),
  )

  const groupUrlFor = (row) => (row.section ? linkBySection[row.section]?.whatsapp_group_url : null)

  // Opens WhatsApp with the invite ready to send, and records the assignment
  // in the same click. Two steps before: open the group, then confirm in a
  // dialog that you'd added them.
  function sendInvite(row) {
    const groupUrl = groupUrlFor(row)
    if (!groupUrl) {
      setError('No WhatsApp Group Link has been configured for this section.')
      return
    }
    const number = whatsappNumber(row.phone)
    const target = number
      ? `https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(row.name, groupUrl))}`
      : groupUrl
    window.open(target, '_blank', 'noopener,noreferrer')
    assignMutation.mutate(row.id)
  }

  function sendBulkInvites() {
    const rows = allRows.filter((row) => selected.includes(row.id))
    const missing = rows.filter((row) => !groupUrlFor(row))
    if (missing.length) {
      setError(`No WhatsApp Group Link configured for: ${missing.map((row) => row.name).join(', ')}.`)
      return
    }
    // One tab per student: the invite is a message to each of them, and
    // WhatsApp has no bulk equivalent. Popup blockers stop everything after
    // the first unless the user has allowed them, so the marking below is what
    // actually records the work either way.
    rows.forEach((row) => {
      const number = whatsappNumber(row.phone)
      if (!number) return
      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(row.name, groupUrlFor(row)))}`,
        '_blank',
        'noopener,noreferrer',
      )
    })
    bulkMutation.mutate(rows.map((row) => row.id))
  }

  const toggleSelected = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  const BASE_COLUMNS = [
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="truncate text-xs text-slate-500">{row.phone}</p>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row) => dash(row.email) },
    { key: 'course_interest', header: 'Course', render: (row) => dash(row.course_interest) },
    {
      key: 'section',
      header: 'Section',
      align: 'center',
      render: (row) => (row.section ? <Badge tone="violet">{row.section.toUpperCase()}</Badge> : dash(null)),
    },
    {
      // Read-only: the batch comes from the student's induction registration
      // month, which is where the coordinator was copying it from anyway.
      key: 'batch',
      header: 'Batch',
      align: 'center',
      render: (row) => (row.batch ? <Badge tone="blue">{row.batch}</Badge> : dash(null)),
    },
  ]

  const SELECT_COLUMN = {
    key: '__select',
    header: '',
    align: 'center',
    render: (row) => (
      <input
        type="checkbox"
        checked={selected.includes(row.id)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => toggleSelected(row.id)}
        aria-label={`Select ${row.name}`}
        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
    ),
  }

  const COLUMNS = {
    approved: [
      SELECT_COLUMN,
      ...BASE_COLUMNS,
      {
        key: 'group_assign',
        header: 'Group',
        align: 'center',
        render: (row) => (
          <Button
            variant="secondary"
            className="px-3! py-1! text-xs"
            disabled={assignMutation.isPending}
            onClick={(event) => {
              event.stopPropagation()
              sendInvite(row)
            }}
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Send invite
          </Button>
        ),
      },
    ],
    group_assigned: [
      ...BASE_COLUMNS,
      {
        key: 'assigned_group',
        header: 'Group',
        align: 'center',
        render: (row) => dash(row.section ? (linkBySection[row.section]?.label ?? row.section.toUpperCase()) : null),
      },
      {
        key: 'group_assigned_at',
        header: 'Added On',
        align: 'center',
        render: (row) => formatDate(row.group_assigned_at),
      },
      {
        key: 'status',
        header: 'Status',
        align: 'center',
        render: () => (
          <Badge tone="green">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            In group
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
            <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
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
        [row.name, row.phone, row.email, row.course_interest, row.batch]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : allRows

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        {TABS.map((item, index) => (
          <StatCard
            key={item.key}
            label={item.label}
            value={tabQueries[index].data?.length ?? 0}
            toneName={item.tone}
            icon={item.icon}
            isActive={tab === item.key}
            onClick={() => {
              setTab(item.key)
              setSearch('')
              setSelected([])
            }}
          />
        ))}
      </div>

      {/* One toolbar band, matching the lead boards. In selection mode it
          swaps to the bulk action rather than growing a second row. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'approved' && rows.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 px-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {selected.length > 0 ? `${selected.length} selected` : 'Select all'}
            </label>
          )}

          <div className="relative min-w-55 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Search name, phone, email, batch…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {selected.length > 0 && (
            <Button onClick={sendBulkInvites} disabled={bulkMutation.isPending}>
              <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {bulkMutation.isPending ? 'Sending…' : `Send invites (${selected.length})`}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable
          columns={COLUMNS[tab]}
          rows={rows}
          isLoading={studentsQuery.isLoading}
          error={studentsQuery.error ? getApiErrorMessage(studentsQuery.error) : null}
          emptyMessage={EMPTY_MESSAGE[tab]}
          onRowClick={(row) => setViewingStudent(row)}
        />
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-600">{rows.length}</span> of {allRows.length} record
          {allRows.length === 1 ? '' : 's'}
        </p>
      </div>

      {viewingStudent && (
        <HRStudentDetailModal
          student={viewingStudent}
          sectionLabel={viewingStudent.section ? linkBySection[viewingStudent.section]?.label : null}
          onClose={() => setViewingStudent(null)}
        />
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
      <Toast
        message={notice?.message}
        tone="success"
        action={notice?.action}
        onDismiss={() => setNotice(null)}
      />
    </div>
  )
}
