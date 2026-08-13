import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Info, Search, Send, Users } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Toast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import { StatCard } from '@/components/ui/StatCard'
import { WhatsAppStatusPill } from '@/components/hr/WhatsAppStatusPill'
import { WhatsAppStudentModal } from '@/components/hr/WhatsAppStudentModal'
import { WHATSAPP_STATUS, WHATSAPP_STATUS_ORDER } from '@/constants/whatsappStatus'
import { formatDateTime } from '@/utils/formatters'
import { TableCard } from '@/components/ui/TableCard'

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

export function WhatsAppOnboardingBoard() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [removing, setRemoving] = useState(null)

  const queueQuery = useQuery({
    queryKey: [QUERY_KEY, 'queue', status],
    queryFn: () => batchConfirmationService.whatsappQueue(status || undefined),
  })
  const countsQuery = useQuery({
    queryKey: [QUERY_KEY, 'counts'],
    queryFn: batchConfirmationService.whatsappCounts,
  })
  const linksQuery = useQuery({ queryKey: ['whatsapp-links'], queryFn: batchConfirmationService.whatsappLinks })
  const configQuery = useQuery({
    queryKey: [QUERY_KEY, 'config'],
    queryFn: batchConfirmationService.whatsappConfig,
  })
  const autoSend = configQuery.data?.configured ?? false

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  const onError = (err) => setError(getApiErrorMessage(err))

  // The server sends the message itself when the Cloud API is configured, and
  // says so. Only when it couldn't does the board open WhatsApp for the
  // coordinator to send by hand - which is why the fallback lives here, after
  // the response, rather than firing a tab open on every click.
  const inviteMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.sendWhatsappInvite(leadId),
    onSuccess: (data, leadId) => {
      invalidate()
      if (data.delivered) {
        setNotice('Invite sent. They stay in Waiting for Join until they accept it.')
        return
      }
      const row = allRows.find((item) => item.id === leadId)
      if (row) openManualInvite(row)
      setNotice('Invite recorded. Send the message that just opened to finish it.')
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
  const removeMutation = useMutation({
    mutationFn: (leadId) => batchConfirmationService.removeFromGroup(leadId),
    onSuccess: () => {
      invalidate()
      setRemoving(null)
      setNotice('Removed from the list and marked Lost. Remember to remove them in WhatsApp too.')
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

  // The fallback for when the server couldn't send: WhatsApp opens with the
  // invite already written, and the coordinator presses send.
  function openManualInvite(row) {
    const groupUrl = groupUrlFor(row)
    if (!groupUrl) return
    const number = whatsappNumber(row.phone)
    window.open(
      number ? `https://wa.me/${number}?text=${encodeURIComponent(inviteMessage(row.name, groupUrl))}` : groupUrl,
      '_blank',
      'noopener,noreferrer',
    )
  }

  function sendBulk() {
    const rows = allRows.filter((row) => selected.includes(row.id))
    const missing = rows.filter((row) => !groupUrlFor(row))
    if (missing.length) {
      setError(`No WhatsApp Group Link configured for: ${missing.map((row) => row.name).join(', ')}.`)
      return
    }
    // Only opens a tab per candidate when the server can't send for us -
    // twenty tabs is a lot to inflict on someone whose invites went out on
    // their own. Popup blockers stop all but the first anyway, which is the
    // other reason automatic sending matters most here.
    if (!autoSend) rows.forEach(openManualInvite)
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
            // The row opens the popup now, so ticking a box must not do both.
            onClick={(event) => event.stopPropagation()}
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
          {/* Carried on the row, not just in the notification a colleague may
              have read yesterday - whoever opens the board next has to be able
              to see who Finance flagged. */}
          {row.non_payment_reported_at && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              <CircleAlert className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              Didn&rsquo;t pay
              {row.non_payment_amount ? ` · ₹${Number(row.non_payment_amount).toLocaleString('en-IN')}` : ''}
            </span>
          )}
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
      render: (row) => <WhatsAppStatusPill status={row.whatsapp_status} />,
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
      // One action, not five. The column carried Send, Mark joined, Log
      // follow-up, Remove and a history icon, which is what pushed the table
      // into a horizontal scroll. The rest live in the row's popup now, and
      // this keeps only the step that row is actually waiting on.
      key: 'actions',
      header: 'Action',
      align: 'center',
      render: (row) => {
        if (row.whatsapp_status === 'joined') return <span className="text-xs text-slate-400">—</span>
        const invited = row.whatsapp_status !== 'not_invited'
        // stopPropagation throughout: the row itself opens the popup now, and
        // a button inside it must not do both.
        return invited ? (
          <Button
            variant="success"
            className="px-2.5! py-1! text-xs"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              joinedMutation.mutate(row.id)
            }}
          >
            Mark joined
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="px-2.5! py-1! text-xs"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              inviteMutation.mutate(row.id)
            }}
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Send invite
          </Button>
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
  const cards = [
    { value: '', label: 'All Candidates', count: counts.all, tone: 'brand', icon: Users },
    ...WHATSAPP_STATUS_ORDER.map((key) => ({
      value: key,
      label: WHATSAPP_STATUS[key].cardLabel ?? WHATSAPP_STATUS[key].label,
      count: counts[key],
      tone: WHATSAPP_STATUS[key].tone,
      icon: WHATSAPP_STATUS[key].icon,
    })),
  ]

  return (
    <div>
      {/* The same StatCard the lead boards and the coordinator queues use.
          Ordered as the lifecycle reads, left to right, so the row doubles as
          a diagram of the process - not invited, waiting, overdue, in. */}
      <div className="mb-4 flex flex-wrap gap-3">
        {cards.map((card) => (
          <StatCard
            key={card.value || 'all'}
            label={card.label}
            value={card.count ?? 0}
            toneName={card.tone}
            icon={card.icon}
            isActive={status === card.value}
            onClick={() => {
              setStatus(card.value)
              setSelected([])
            }}
          />
        ))}
      </div>

      {/* Said before anybody presses Send, not after: whether the button
          delivers the message or hands you one to send makes a real difference
          to how the queue is worked. */}
      {!configQuery.isLoading && !autoSend && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden="true" />
          <p>
            <span className="font-semibold">Manual sending.</span> WhatsApp API credentials aren&rsquo;t
            configured, so Send invite opens WhatsApp with the message ready and you press send. The invite is
            recorded either way.
          </p>
        </div>
      )}

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

      <TableCard>
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={queueQuery.isLoading}
          error={queueQuery.error ? getApiErrorMessage(queueQuery.error) : null}
          emptyMessage="No candidates in this state. Leads arrive here once Finance moves them to Batch Confirmation."
          onRowClick={(row) => setViewing(row)}
        />
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-600">{rows.length}</span> of {allRows.length}
        </p>
      </TableCard>

      {viewing && (
        <WhatsAppStudentModal
          student={viewing}
          isBusy={busy}
          onClose={() => setViewing(null)}
          onInvite={(id) => {
            inviteMutation.mutate(id)
            setViewing(null)
          }}
          onJoined={(id) => {
            joinedMutation.mutate(id)
            setViewing(null)
          }}
          onFollowUp={(id) => {
            followUpMutation.mutate(id)
            setViewing(null)
          }}
          // Hands off to the confirm dialog rather than removing straight from
          // the popup - this one marks the student Lost.
          onRemove={(row) => {
            setViewing(null)
            setRemoving(row)
          }}
        />
      )}

      {removing && (
        <Modal title="Remove from group" isOpen onClose={() => setRemoving(null)} maxWidth="max-w-md">
          <p className="text-sm text-slate-700">
            Remove <span className="font-semibold">{removing.name}</span> from the batch list and mark them{' '}
            <span className="font-semibold">Lost</span>?
          </p>
          {/* Said plainly, because the ERP cannot do it: WhatsApp has no API
              for removing a group member either. */}
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You still need to remove them from the WhatsApp group yourself — WhatsApp doesn&rsquo;t let the ERP
            do that. This records it here.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => removeMutation.mutate(removing.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? 'Removing…' : 'Remove and mark Lost'}
            </Button>
          </div>
        </Modal>
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
      <Toast message={notice} tone="success" onDismiss={() => setNotice(null)} />
    </div>
  )
}
