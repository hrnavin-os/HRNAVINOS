import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Phone, PhoneCall } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AttendanceControl, RemarkThread } from '@/components/studentPortal/AttendanceControls'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { formatDate } from '@/utils/formatters'

function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 10 ? `91${digits}` : digits
}

function AbsenteeCard({ row, session, canMark, onChanged }) {
  const number = whatsappNumber(row.phone)
  const message = `Hi ${row.name}, we missed you at class ${session.sequence} (${session.title}) on ${formatDate(session.held_on)}. Is everything okay? The recording is on your student link.`
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {row.name}
            {row.call_remarks.length > 0 && (
              <span className="ml-2">
                <Badge tone="teal">
                  {row.call_remarks.length} call{row.call_remarks.length === 1 ? '' : 's'} logged
                </Badge>
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">{row.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.phone && (
            <a
              href={`tel:${row.phone}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {row.phone}
            </a>
          )}
          {number && (
            <a
              href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200 hover:bg-green-50"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              WhatsApp
            </a>
          )}
          <AttendanceControl
            sessionId={session.id}
            studentId={row.student_id}
            override={row.override}
            disabled={!canMark}
            onChanged={onChanged}
          />
        </div>
      </div>
      <RemarkThread
        sessionId={session.id}
        studentId={row.student_id}
        remarks={row.call_remarks}
        canAdd={canMark}
        onAdded={onChanged}
      />
    </li>
  )
}

/**
 * The absentee call list for one class: everybody still enrolled who neither
 * joined it live nor opened the recording, with their number and what they
 * said on the last call. Watching the recording later takes a student off the
 * list by itself - catching up is attending.
 */
export function AbsenteesPanel({ sessions, canMark }) {
  const refresh = usePortalRefresh()
  const held = sessions.filter((session) => session.held).sort((a, b) => b.sequence - a.sequence)
  const [sessionId, setSessionId] = useState(held[0]?.id ?? '')
  const activeId = held.some((session) => session.id === sessionId) ? sessionId : held[0]?.id

  const query = useQuery({
    queryKey: ['portal-session', activeId],
    queryFn: () => studentPortalService.sessionRoster(activeId),
    enabled: Boolean(activeId),
  })

  if (!held.length) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        No class has been held yet, so there is nobody to call.
      </Card>
    )
  }

  const session = query.data?.session
  const absentees = (query.data?.rows ?? []).filter((row) => row.attended === false && row.status !== 'dropped')

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="w-full max-w-sm">
          <Select label="Class" value={activeId} onChange={(event) => setSessionId(event.target.value)}>
            {held.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {`Class ${entry.sequence} · ${entry.title} · ${formatDate(entry.held_on)} (${entry.absent_count} absent)`}
              </option>
            ))}
          </Select>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <PhoneCall className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {session ? `${absentees.length} to call` : ''}
        </p>
      </div>
      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.isError ? (
        <div className="p-4">
          <ErrorMessage message={getApiErrorMessage(query.error)} />
        </div>
      ) : absentees.length ? (
        <ul className="divide-y divide-slate-100">
          {absentees.map((row) => (
            <AbsenteeCard key={row.student_id} row={row} session={session} canMark={canMark} onChanged={refresh} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Everyone attended this class, live or on the recording.</p>
      )}
    </Card>
  )
}
