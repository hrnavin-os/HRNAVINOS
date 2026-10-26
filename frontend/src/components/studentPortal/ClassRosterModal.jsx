import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, MessageSquare, Pencil, RefreshCw, UserX } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { TabStrip } from '@/components/ui/TabStrip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AttendanceBadge } from '@/components/studentPortal/AttendanceBadge'
import { AttendanceControl, RemarkThread } from '@/components/studentPortal/AttendanceControls'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { formatDate, formatDateTime, formatMinutes } from '@/utils/formatters'

const FILTERS = [
  { key: 'all', label: 'Everyone' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
]

// What lies behind the badge: the time in the call, and when the recording
// was first opened. Shown even when a staff answer overrides them, so the
// person correcting can see what they are correcting.
function Evidence({ row }) {
  const parts = []
  if (row.live) {
    parts.push(
      `In the call ${formatMinutes(row.live.duration_seconds)}${row.live.attended ? '' : ' (under the minimum)'}`,
    )
  }
  if (row.recording_viewed_at) parts.push(`Recording viewed in Drive ${formatDateTime(row.recording_viewed_at)}`)
  if (row.recording_opened_at) parts.push(`Recording opened from link ${formatDateTime(row.recording_opened_at)}`)
  if (row.override !== null && row.override_by_name) {
    parts.push(`Marked ${row.override ? 'present' : 'absent'} by ${row.override_by_name}`)
  }
  if (!parts.length) return null
  return <p className="mt-0.5 text-[11px] text-slate-500">{parts.join(' · ')}</p>
}

function RosterRow({ row, sessionId, canMark, onChanged }) {
  const [showRemarks, setShowRemarks] = useState(false)
  const dropped = row.status === 'dropped'

  return (
    <li className={`px-3 py-2 ${dropped ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {row.name}
            {dropped && <span className="ml-1.5 text-xs font-normal text-slate-500">(dropped)</span>}
            {!row.terms_signed && (
              <span className="ml-1.5">
                <Badge tone="amber">T&amp;C pending</Badge>
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">{row.phone ?? row.email}</p>
          <Evidence row={row} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AttendanceBadge attended={row.attended} via={row.via} />
          <AttendanceControl
            sessionId={sessionId}
            studentId={row.student_id}
            override={row.override}
            disabled={!canMark}
            onChanged={onChanged}
          />
          <button
            type="button"
            onClick={() => setShowRemarks((open) => !open)}
            className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-expanded={showRemarks}
            title="Absentee call remarks"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {row.call_remarks.length}
          </button>
        </div>
      </div>
      {showRemarks && (
        <div className="mt-2 border-l-2 border-slate-200 pl-3">
          <RemarkThread
            sessionId={sessionId}
            studentId={row.student_id}
            remarks={row.call_remarks}
            canAdd={canMark}
            onAdded={onChanged}
          />
        </div>
      )}
    </li>
  )
}

/** One class's roll: who was there, how, and what staff have said about it. */
export function ClassRosterModal({ sessionId, canMark, canManage, onEdit, onClose }) {
  const refresh = usePortalRefresh()
  const [filter, setFilter] = useState('all')
  const [showUnmatched, setShowUnmatched] = useState(false)
  const query = useQuery({
    queryKey: ['portal-session', sessionId],
    queryFn: () => studentPortalService.sessionRoster(sessionId),
  })
  const sync = useMutation({ mutationFn: () => studentPortalService.syncSession(sessionId), onSuccess: refresh })

  const session = query.data?.session
  const rows = (query.data?.rows ?? []).filter((row) =>
    filter === 'present' ? row.attended === true : filter === 'absent' ? row.attended === false : true,
  )
  const syncError = session?.live_sync_error || session?.recording_sync_error

  return (
    <Modal
      title={session ? `Class ${session.sequence} · ${session.title}` : 'Class'}
      isOpen
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.isError ? (
        <ErrorMessage message={getApiErrorMessage(query.error)} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs text-slate-600">
              <p>
                {formatDate(session.held_on)}
                {session.start_time && ` · ${session.start_time}`}
                {session.meeting_code && <span className="ml-2 font-mono text-slate-500">{session.meeting_code}</span>}
              </p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="green">{session.live_count} live</Badge>
                <Badge tone="blue">{session.recording_count} recording</Badge>
                {session.held && <Badge tone="red">{session.absent_count} absent</Badge>}
                {session.recording_url && (
                  <a
                    href={session.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700"
                  >
                    <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    Recording
                  </a>
                )}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {session.live_synced_at ? `Meet read ${formatDateTime(session.live_synced_at)}` : 'Meet not read yet'}
                {' · '}
                {session.recording_synced_at
                  ? `Drive read ${formatDateTime(session.recording_synced_at)}`
                  : 'Drive not read yet'}
              </p>
            </div>
            <div className="flex gap-1.5">
              {canManage && (
                <Button variant="secondary" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Edit
                </Button>
              )}
              {canMark && (
                <Button variant="secondary" onClick={() => sync.mutate()} disabled={sync.isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
                  Sync now
                </Button>
              )}
            </div>
          </div>

          {syncError && (
            <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              {syncError}
            </p>
          )}
          <ErrorMessage message={sync.error && getApiErrorMessage(sync.error)} />

          <TabStrip tabs={FILTERS} value={filter} onChange={setFilter} />

          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {rows.length ? (
              rows.map((row) => (
                <RosterRow key={row.student_id} row={row} sessionId={sessionId} canMark={canMark} onChanged={refresh} />
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-slate-400">Nobody here.</li>
            )}
          </ul>

          {session.unmatched.length > 0 && (
            <div className="rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setShowUnmatched((open) => !open)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-slate-700"
              >
                <UserX className="h-3.5 w-3.5 text-red-500" strokeWidth={2} aria-hidden="true" />
                {session.unmatched.length} in the call matched nobody in this batch
              </button>
              {showUnmatched && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60">
                  {session.unmatched.map((person) => (
                    <li key={person.identifier} className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-slate-800">{person.display_name || '—'}</span>
                        <span className="ml-1.5 text-slate-500">{person.identifier}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">{formatMinutes(person.duration_seconds)}</span>
                    </li>
                  ))}
                  <li className="px-3 py-1.5 text-[11px] text-slate-500">
                    Usually a student on a different email. Correct their email and the next sync picks them up.
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
