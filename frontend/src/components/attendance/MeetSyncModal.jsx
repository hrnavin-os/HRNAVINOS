import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Link2, RefreshCw, Trash2, UserX } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { attendanceBoardService } from '@/services/attendanceBoardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDate, formatDateTime, formatMinutes as minutes } from '@/utils/formatters'

// Who the audit log saw in one meeting whose email or phone is on no student.
// Correcting a student's email picks them up on the next sync.
function Unmatched({ session }) {
  const query = useQuery({
    queryKey: ['meet-participants', session.id, 'unmatched'],
    queryFn: () => attendanceBoardService.meetParticipants(session.id, false),
  })
  if (query.isLoading) return <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
  const rows = query.data ?? []
  if (!rows.length) return <p className="px-3 py-2 text-xs text-slate-400">Everyone in the call matched a student.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.identifier} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
          <span className="min-w-0 truncate">
            <span className="font-medium text-slate-800">{row.display_name || '—'}</span>
            <span className="ml-1.5 text-slate-500">{row.identifier}</span>
          </span>
          <span className="shrink-0 tabular-nums text-slate-500">{minutes(row.duration_seconds)}</span>
        </li>
      ))}
    </ul>
  )
}

function SessionRow({ session, onChanged }) {
  const [showUnmatched, setShowUnmatched] = useState(false)
  const sync = useMutation({ mutationFn: () => attendanceBoardService.syncMeetSession(session.id), onSuccess: onChanged })
  const unlink = useMutation({
    mutationFn: () => attendanceBoardService.unlinkMeetSession(session.id),
    onSuccess: onChanged,
  })
  const error = sync.error || unlink.error

  return (
    <li className="rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {formatDate(session.held_on)}
            <span className="ml-2 font-mono text-xs font-medium text-slate-500">{session.meeting_code}</span>
            {session.title && <span className="ml-2 font-normal text-slate-600">{session.title}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <Badge tone="green">{session.attended_count} attended</Badge>
            {session.too_short_count > 0 && (
              <Badge tone="amber">
                {session.too_short_count} under {session.min_minutes} min
              </Badge>
            )}
            <button type="button" onClick={() => setShowUnmatched((open) => !open)}>
              <Badge tone={session.unmatched_count ? 'red' : 'slate'}>
                <UserX className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                {session.unmatched_count} unmatched
              </Badge>
            </button>
            <span>{session.last_synced_at ? `Synced ${formatDateTime(session.last_synced_at)}` : 'Not synced yet'}</span>
          </p>
          {session.last_sync_error && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-red-600">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
              {session.last_sync_error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="secondary" className="px-2.5! py-1! text-xs" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
            Sync now
          </Button>
          <Button
            variant="ghost"
            className="px-2! py-1! text-xs text-red-600"
            title="Unlink - removes the attendance this meeting marked"
            onClick={() => unlink.mutate()}
            disabled={unlink.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error && (
        <div className="px-3 pb-2">
          <ErrorMessage message={getApiErrorMessage(error)} />
        </div>
      )}
      {showUnmatched && (
        <div className="border-t border-slate-100 bg-slate-50/60">
          <Unmatched session={session} />
        </div>
      )}
    </li>
  )
}

/**
 * The Google Meet meetings behind one page (Success Meet or Foundation Class).
 *
 * Link a meeting and the day it was held; its attendance is read from the
 * Workspace Meet audit log straight away and again every few minutes for a
 * few days after. Marks from Meet show on the board as "Google Meet"; a mark
 * set by hand is a correction and is never overwritten by a sync.
 */
export function MeetSyncModal({ marker, label, onClose, onSynced }) {
  const queryClient = useQueryClient()
  const [meeting, setMeeting] = useState('')
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [minMinutes, setMinMinutes] = useState('10')

  const statusQuery = useQuery({ queryKey: ['meet-status'], queryFn: attendanceBoardService.meetStatus })
  const sessionsQuery = useQuery({
    queryKey: ['meet-sessions', marker],
    queryFn: () => attendanceBoardService.meetSessions(marker),
  })

  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['meet-sessions', marker] })
    queryClient.invalidateQueries({ queryKey: ['meet-participants'] })
    onSynced()
  }

  const link = useMutation({
    mutationFn: () =>
      attendanceBoardService.linkMeetSession({
        marker,
        meeting,
        held_on: heldOn,
        title: title || null,
        min_minutes: Number(minMinutes) || 0,
      }),
    onSuccess: () => {
      setMeeting('')
      setTitle('')
      changed()
    },
  })

  const status = statusQuery.data
  const sessions = sessionsQuery.data ?? []

  return (
    <Modal title={`Google Meet · ${label}`} isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {status && !status.configured && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">Automatic sync isn&rsquo;t set up on the server yet.</p>
            <p className="mt-1">
              Meetings can be linked now; they are read once the server has a Google service account with
              domain-wide delegation for <span className="font-mono">admin.reports.audit.readonly</span> and{' '}
              <span className="font-mono">GOOGLE_MEET_ADMIN_EMAIL</span> set to a Workspace admin.
              {status.service_account_email && (
                <>
                  {' '}
                  Service account: <span className="font-mono">{status.service_account_email}</span>.
                </>
              )}
            </p>
          </div>
        )}

        <form
          className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            link.mutate()
          }}
        >
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Link2 className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
            Link a meeting
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              label="Meet link or code"
              required
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meeting}
              onChange={(event) => setMeeting(event.target.value)}
            />
            <Input label="Held on" type="date" required value={heldOn} onChange={(event) => setHeldOn(event.target.value)} />
            <Input
              label="Title (optional)"
              placeholder="e.g. Group 2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              label="Counts as attended after (minutes)"
              type="number"
              min="0"
              value={minMinutes}
              onChange={(event) => setMinMinutes(event.target.value)}
            />
          </div>
          <ErrorMessage message={link.error ? getApiErrorMessage(link.error) : null} />
          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={link.isPending || !meeting.trim()}>
              {link.isPending ? 'Linking…' : 'Link and sync'}
            </Button>
          </div>
        </form>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Linked meetings</p>
          {sessionsQuery.isLoading ? (
            <LoadingSpinner />
          ) : sessions.length ? (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} onChanged={changed} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No meetings linked yet.</p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Students are matched on the email (or phone, for dial-ins) on their induction record. A mark set by
            hand on the board is a correction and is never overwritten by a sync.
          </p>
        </div>
      </div>
    </Modal>
  )
}
