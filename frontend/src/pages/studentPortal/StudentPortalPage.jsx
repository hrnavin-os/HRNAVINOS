import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CirclePlay,
  FileDown,
  FileSignature,
  PhoneCall,
  Plus,
  Search,
  Users,
  Video,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { StatCard } from '@/components/ui/StatCard'
import { TabStrip } from '@/components/ui/TabStrip'
import { TableCard } from '@/components/ui/TableCard'
import { DataTable } from '@/components/ui/DataTable'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AttendanceBadge, PercentBadge } from '@/components/studentPortal/AttendanceBadge'
import { ClassSessionModal } from '@/components/studentPortal/ClassSessionModal'
import { ClassRosterModal } from '@/components/studentPortal/ClassRosterModal'
import { PortalStudentModal } from '@/components/studentPortal/PortalStudentModal'
import { AbsenteesPanel } from '@/components/studentPortal/AbsenteesPanel'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { formatDate, titleCase } from '@/utils/formatters'

const TABS = [
  { key: 'students', label: 'Students', icon: Users },
  { key: 'classes', label: 'Classes', icon: CalendarDays },
  { key: 'absentees', label: 'Absentees', icon: PhoneCall },
]

const STATUS_TONES = { active: 'green', on_hold: 'amber', completed: 'blue', dropped: 'red' }

const studentColumns = [
  {
    key: 'name',
    header: 'Student',
    sticky: true,
    render: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{row.name}</p>
        <p className="text-xs text-slate-500">{row.phone ?? row.email}</p>
      </div>
    ),
  },
  {
    key: 'terms',
    header: 'T&C',
    render: (row) =>
      row.terms_signed ? (
        <Badge tone="green">Signed {formatDate(row.terms_accepted_at)}</Badge>
      ) : (
        <Badge tone="amber">{row.has_link ? 'Pending · link sent' : 'Pending · no link'}</Badge>
      ),
  },
  {
    key: 'percent',
    header: 'Attendance',
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <PercentBadge percent={row.totals.percent} />
        <span className="text-xs tabular-nums text-slate-500">
          {row.totals.attended}/{row.totals.held}
        </span>
      </span>
    ),
  },
  {
    key: 'via',
    header: 'Live · Recording · Marked',
    render: (row) => (
      <span className="text-xs tabular-nums text-slate-600">
        {row.totals.live} · {row.totals.recording} · {row.totals.manual}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
]

function ClassesList({ sessions, onOpen }) {
  if (!sessions.length) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        No classes yet. Add the first one with its Google Meet link; the recording can be added after.
      </Card>
    )
  }
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onOpen(session)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">
                    {session.sequence}
                  </span>
                  {session.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    {formatDate(session.held_on)}
                    {session.start_time && ` · ${session.start_time}`}
                  </span>
                  {session.meeting_code ? (
                    <span className="inline-flex items-center gap-1">
                      <Video className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      <span className="font-mono">{session.meeting_code}</span>
                    </span>
                  ) : (
                    <span>No Meet link</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CirclePlay className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    {session.recording_url ? 'Recording added' : 'No recording yet'}
                  </span>
                  {(session.live_sync_error || session.recording_sync_error) && (
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      Sync failed
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {session.held ? (
                  <>
                    <Badge tone="green">{session.live_count} live</Badge>
                    <Badge tone="blue">{session.recording_count} recording</Badge>
                    <Badge tone="red">{session.absent_count} absent</Badge>
                  </>
                ) : (
                  <AttendanceBadge attended={null} />
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function BatchBoard({ batchId, canMark, canManage }) {
  const refresh = usePortalRefresh()
  const [tab, setTab] = useState('students')
  const [search, setSearch] = useState('')
  const [termsPendingOnly, setTermsPendingOnly] = useState(false)
  const [studentId, setStudentId] = useState(null)
  const [rosterSessionId, setRosterSessionId] = useState(null)
  // undefined: closed. null: adding a new class. An object: editing that one.
  const [editing, setEditing] = useState(undefined)

  const query = useQuery({
    queryKey: ['portal-batch', batchId],
    queryFn: () => studentPortalService.roster(batchId),
  })

  const download = useMutation({
    mutationFn: () => studentPortalService.attendancePdf(batchId),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    },
  })

  const data = query.data
  const students = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.students ?? []).filter(
      (row) =>
        (!termsPendingOnly || !row.terms_signed) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          row.email.toLowerCase().includes(needle) ||
          (row.phone ?? '').includes(needle)),
    )
  }, [data, search, termsPendingOnly])

  if (query.isLoading) return <LoadingSpinner />
  if (query.isError) return <ErrorMessage message={getApiErrorMessage(query.error)} />

  const { batch, sessions } = data
  const heldCount = sessions.filter((session) => session.held).length
  const percents = data.students.map((row) => row.totals.percent).filter((value) => value !== null)
  const average = percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : null
  const nextSequence = sessions.reduce((max, session) => Math.max(max, session.sequence), 0) + 1
  const editingSession = sessions.find((session) => session.id === rosterSessionId)

  return (
    <div className="space-y-4">
      {!data.sync_configured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">Automatic attendance isn&rsquo;t set up on the server yet.</p>
          <p className="mt-1">
            Classes can be scheduled and marked by hand now. Live attendance and recording views are read automatically
            once the server&rsquo;s Google service account has domain-wide delegation for{' '}
            <span className="font-mono">admin.reports.audit.readonly</span> and{' '}
            <span className="font-mono">GOOGLE_MEET_ADMIN_EMAIL</span> is set - the same setup the Success Meet sync
            uses. Recordings opened from a student&rsquo;s link are counted either way.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={batch.student_count} toneName="brand" icon={Users} />
        <StatCard
          label="T&C signed"
          value={`${batch.terms_signed_count}/${batch.student_count}`}
          toneName={batch.terms_signed_count === batch.student_count ? 'emerald' : 'amber'}
          icon={FileSignature}
          isActive={termsPendingOnly}
          onClick={() => {
            setTab('students')
            setTermsPendingOnly((value) => !value)
          }}
          hint={termsPendingOnly ? 'Showing pending only' : 'Click to show pending'}
        />
        <StatCard label="Classes held" value={`${heldCount}/${sessions.length}`} toneName="blue" icon={CalendarDays} />
        <StatCard
          label="Average attendance"
          value={average === null ? '—' : `${average}%`}
          toneName={average === null ? 'slate' : average >= 80 ? 'emerald' : average >= 60 ? 'amber' : 'rose'}
          icon={Video}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabStrip tabs={TABS} value={tab} onChange={setTab} />
        <div className="flex flex-wrap gap-2">
          {tab === 'classes' && canManage && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Add class
            </Button>
          )}
          <Button variant="secondary" onClick={() => download.mutate()} disabled={download.isPending}>
            <FileDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {download.isPending ? 'Preparing…' : 'Attendance PDF'}
          </Button>
        </div>
      </div>
      <ErrorMessage message={download.error && getApiErrorMessage(download.error)} />

      {tab === 'students' && (
        <TableCard>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <div className="w-full max-w-xs">
              <Input
                placeholder="Search name, email or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                rightElement={<Search className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />}
              />
            </div>
            {termsPendingOnly && (
              <button
                type="button"
                onClick={() => setTermsPendingOnly(false)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Showing T&amp;C pending only · show everyone
              </button>
            )}
          </div>
          <DataTable
            columns={studentColumns}
            rows={students}
            emptyMessage={data.students.length ? 'No student matches.' : 'No students in this batch yet.'}
            onRowClick={(row) => setStudentId(row.id)}
          />
        </TableCard>
      )}
      {tab === 'classes' && <ClassesList sessions={sessions} onOpen={(session) => setRosterSessionId(session.id)} />}
      {tab === 'absentees' && <AbsenteesPanel sessions={sessions} canMark={canMark} />}

      {studentId && (
        <PortalStudentModal
          studentId={studentId}
          canMark={canMark}
          canManage={canManage}
          onClose={() => setStudentId(null)}
        />
      )}
      {rosterSessionId && editing === undefined && (
        <ClassRosterModal
          sessionId={rosterSessionId}
          canMark={canMark}
          canManage={canManage}
          onEdit={() => setEditing(editingSession)}
          onClose={() => setRosterSessionId(null)}
        />
      )}
      {editing !== undefined && (
        <ClassSessionModal
          batchId={batchId}
          session={editing}
          nextSequence={nextSequence}
          canManage={canManage}
          onClose={() => setEditing(undefined)}
          onSaved={({ removed }) => {
            refresh()
            // A removed class has no roll to go back to.
            if (removed) setRosterSessionId(null)
            setEditing(undefined)
          }}
        />
      )}
    </div>
  )
}

/**
 * The Student Portal: where staff run an enrolled batch.
 *
 * Students never log in. Each has a private link (/s/<token>) on which they
 * sign the Terms & Conditions - the first step, before anything else opens -
 * and then find their live classes and recordings. Everything about them is
 * managed from here: the classes and their Meet and Drive links, attendance
 * read from Meet and Drive with staff corrections, the absentee calls, and
 * the attendance report.
 */
export function StudentPortalPage() {
  const { hasPermission } = useAuth()
  const canMark = hasPermission(PERMISSIONS.STUDENT_PORTAL_MARK)
  const canManage = hasPermission(PERMISSIONS.STUDENT_PORTAL_MANAGE)
  const [params, setParams] = useSearchParams()

  const batchesQuery = useQuery({ queryKey: ['portal-batches'], queryFn: studentPortalService.batches })

  if (batchesQuery.isLoading) return <LoadingSpinner />
  if (batchesQuery.isError) return <ErrorMessage message={getApiErrorMessage(batchesQuery.error)} />

  const batches = batchesQuery.data ?? []
  if (!batches.length) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-slate-800">No enrolled batches yet.</p>
        <p className="mt-1 text-sm text-slate-500">
          A batch appears here once it is confirmed under Batch Confirmation, which is what turns its leads into
          students.
        </p>
      </Card>
    )
  }

  const selected = batches.find((batch) => batch.id === params.get('batch')) ?? batches[0]

  return (
    <div className="space-y-4">
      <div className="w-full max-w-md">
        <Select
          label="Batch"
          value={selected.id}
          onChange={(event) => setParams({ batch: event.target.value }, { replace: true })}
        >
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {[batch.name, batch.course_name, `${batch.student_count} students`].filter(Boolean).join(' · ')}
            </option>
          ))}
        </Select>
      </div>
      {/* Keyed so switching batch starts the board fresh, rather than carrying
          the last batch's search, tab and open dialogs across. */}
      <BatchBoard key={selected.id} batchId={selected.id} canMark={canMark} canManage={canManage} />
    </div>
  )
}
