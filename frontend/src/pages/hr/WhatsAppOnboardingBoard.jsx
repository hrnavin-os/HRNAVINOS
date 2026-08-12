import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Search, Send } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Toast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  WHATSAPP_ACTION_LABELS,
  WHATSAPP_STATUS,
  WHATSAPP_STATUS_ORDER,
} from '@/constants/whatsappStatus'
import { formatDateTime } from '@/utils/formatters'

const QUERY_KEY = 'whatsapp-onboarding'

const dash = <span className="text-slate-400">—</span>
const orDash = (value) => (value ? formatDateTime(value) : dash)

// wa.me wants digits only with a country code; a stored Indian number is the
// bare ten digits.
function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 10 ? `91${digits}` : digits
}

function inviteMessage(name, groupUrl) {
  return `Hi ${name}, welcome to HRNAVINOS! Join your batch group here: ${groupUrl}`
}

function StatusPill({ status }) {
  const style = WHATSAPP_STATUS[status] ?? WHATSAPP_STATUS.not_invited
  const Icon = style.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.pill}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {style.label}
    </span>
  )
}

function HistoryModal({ lead, onClose }) {
  const query = useQuery({
    queryKey: [QUERY_KEY, 'history', lead.id],
    queryFn: () => batchConfirmationService.whatsappHistory(lead.id),
  })

  return (
    <Modal title={`Group history — ${lead.name}`} isOpen onClose={onClose} maxWidth="max-w-lg">
      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.data?.length ? (
        <ol className="space-y-3">
          {query.data.map((entry, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {WHATSAPP_ACTION_LABELS[entry.action] ?? entry.action}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(entry.created_at)}
                  {entry.user_name ? ` · ${entry.user_name}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          Nothing recorded yet. Sending the first invite starts the history.
        </p>
      )}
    </Modal>
  )
}

export function WhatsAppOnboardingBoard() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [historyLead, setHistoryLead] = useState(null)

  const queueQuery = useQuery({
    queryKey: [QUERY_KEY, 'queue', status],
    queryFn: () => batchConfirmationService.whatsappQueue(status || undefined),
  })
  const countsQuery = useQuery({
    queryKey: [QUERY_KEY, 'counts'],
    queryFn: batchConfirmationService.whatsappCounts,
  })
  const linksQuery = useQuery({ queryKey: ['whatsapp-links'], queryFn: batchConfirmationService.whatsappLinks })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  const onError = (err) => setError(getApiErrorMessage(err))

  const inviteMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.sendWhatsappInvite(leadId),
    onSuccess: () => {
      invalidate()
      setNotice('Invite recorded. They stay in Waiting for Join until you mark them joined.')
    },
    onError,
  })
  const joinedMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.markWhatsappJoined(leadId),
    onSuccess: () => {
      invalidate()
      setNotice('Marked as joined.')
    },
    onError,
  })
  const followUpMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.logWhatsappFollowUp(leadId),
    onSuccess: () => {
      invalidate()
      setNotice('Follow-up recorded.')
    },
    onError,
  })
  const bulkMutation = useMutation({
    mutationFn: (leadIds) => batchConfirmationService.sendWhatsappInviteBulk(leadIds),
    onSuccess: (data) => {
      invalidate()
      setSelected([])
      setNotice(data.message)
    },
    onError,
  })

  const linkBySection = Object.fromEntries(
    (linksQuery.data ?? []).map((section) => [section.code, section]),
  )
  const groupUrlFor = (row) => (row.section ? linkBySection[row.section]?.whatsapp_group_url : null)

  // Opens WhatsApp with the invite written to that candidate, then records
  // that it was sent. Recording is separate from joining - the candidate has
  // to accept the invite themselves, and no WhatsApp API reports when they do.
  function openAndRecordInvite(row) {
    const groupUrl = groupUrlFor(row)
    if (!groupUrl) {
      setError('No WhatsApp Group Link has been configured for this section.')
      return
    }
    const number = whatsappNumber(row.phone)
    window.open(
      number ? `https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(row.name, groupUrl))}` : groupUrl,
      '_blank',
      'noopener,noreferrer',
    )
    inviteMutation.mutate(row.id)
  }

  function sendBulk() {
    const rows = allRows.filter((row) => selected.includes(row.id))
    const missing = rows.filter((row) => !groupUrlFor(row))
    if (missing.length) {
      setError(`No WhatsApp Group Link configured for: ${missing.map((row) => row.name).join(', ')}.`)
      return
    }
    rows.forEach((row) => {
      const number = whatsappNumber(row.phone)
      if (number) {
        window.open(
          `https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(row.name, groupUrlFor(row)))}`,
          '_blank',
          'noopener,noreferrer',
        )
      }
    })
    bulkMutation.mutate(rows.map((row) => row.id))
  }

  const toggleSelected = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  const busy = inviteMutation.isPending || joinedMutation.isPending || followUpMutation.isPending

  const columns = [
    {
      key: '__select',
      header: '',
      align: 'center',
      render: (row) =>
        row.whatsapp_status === 'joined' ? null : (
          <input
            type="checkbox"
            checked={selected.includes(row.id)}
            onChange={() => toggleSelected(row.id)}
            aria-label={`Select ${row.name}`}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
        ),
    },
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="truncate text-xs text-slate-500">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course / Batch',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-700">{row.course_interest ?? '—'}</p>
          {row.batch && <p className="text-xs text-slate-500">{row.batch}</p>}
        </div>
      ),
    },
    {
      key: 'lead_status',
      header: 'Lead Status',
      align: 'center',
      render: () => <Badge tone="emerald">Batch Confirmation</Badge>,
    },
    {
      key: 'whatsapp_status',
      header: 'WhatsApp Group',
      align: 'center',
      render: (row) => <StatusPill status={row.whatsapp_status} />,
    },
    {
      key: 'invite_sent_at',
      header: 'Invite Sent',
      align: 'center',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-700">{orDash(row.whatsapp_invite_sent_at)}</p>
          {row.whatsapp_invite_count > 1 && (
            <p className="text-xs text-slate-400">{row.whatsapp_invite_count} attempts</p>
          )}
        </div>
      ),
    },
    { key: 'joined_at', header: 'Joined', align: 'center', render: (row) => orDash(row.joined_at) },
    {
      key: 'last_follow_up',
      header: 'Last Follow-up',
      align: 'center',
      render: (row) => orDash(row.whatsapp_last_follow_up_at),
    },
    {
      key: 'handled_by',
      header: 'Coordinator',
      align: 'center',
      render: (row) => row.whatsapp_handled_by_name ?? dash,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      render: (row) => {
        const joined = row.whatsapp_status === 'joined'
        const invited = row.whatsapp_status !== 'not_invited'
        return (
          <div className="flex items-center justify-center gap-1.5">
            {!joined && (
              <Button
                variant="secondary"
                className="px-2.5! py-1! text-xs"
                disabled={busy}
                onClick={() => openAndRecordInvite(row)}
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {invited ? 'Resend' : 'Send invite'}
              </Button>
            )}
            {!joined && invited && (
              <Button
                variant="success"
                className="px-2.5! py-1! text-xs"
                disabled={busy}
                onClick={() => joinedMutation.mutate(row.id)}
              >
                Mark joined
              </Button>
            )}
            {row.whatsapp_status === 'follow_up_required' && (
              <Button
                variant="secondary"
                className="px-2.5! py-1! text-xs"
                disabled={busy}
                onClick={() => followUpMutation.mutate(row.id)}
              >
                Log follow-up
              </Button>
            )}
            <button
              type="button"
              onClick={() => setHistoryLead(row)}
              title="Group history"
              aria-label={`Group history for ${row.name}`}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <History className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )
      },
    },
  ]

  const term = search.trim().toLowerCase()
  const allRows = queueQuery.data ?? []
  const rows = term
    ? allRows.filter((row) =>
        [row.name, row.phone, row.course_interest, row.batch]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : allRows

  const counts = countsQuery.data ?? {}
  const chips = [
    { value: '', label: 'All', count: counts.all, chip: 'border-brand-300 bg-brand-100 text-brand-800' },
    ...WHATSAPP_STATUS_ORDER.map((key) => ({
      value: key,
      label: WHATSAPP_STATUS[key].chipLabel ?? WHATSAPP_STATUS[key].label,
      count: counts[key],
      chip: WHATSAPP_STATUS[key].chip,
      dot: WHATSAPP_STATUS[key].dot,
    })),
  ]

  return (
    <div>
      {/* Chips rather than the stat cards used elsewhere: these are one row of
          a single lifecycle, and reading them left to right is meant to show
          the process - not invited, waiting, overdue, in. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value || 'all'}
            type="button"
            onClick={() => {
              setStatus(chip.value)
              setSelected([])
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              status === chip.value ? chip.chip : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {chip.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${chip.dot}`} />}
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-55 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Search name, phone, course, batch…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {selected.length > 0 && (
            <Button onClick={sendBulk} disabled={bulkMutation.isPending}>
              <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {bulkMutation.isPending ? 'Sending…' : `Send invites (${selected.length})`}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={queueQuery.isLoading}
          error={queueQuery.error ? getApiErrorMessage(queueQuery.error) : null}
          emptyMessage="No candidates in this state. Leads arrive here once Finance moves them to Batch Confirmation."
        />
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-600">{rows.length}</span> of {allRows.length}
        </p>
      </div>

      {historyLead && <HistoryModal lead={historyLead} onClose={() => setHistoryLead(null)} />}

      <Toast message={error} onDismiss={() => setError(null)} />
      <Toast message={notice} tone="success" onDismiss={() => setNotice(null)} />
    </div>
  )
}
