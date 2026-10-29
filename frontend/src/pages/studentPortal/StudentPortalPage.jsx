import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CirclePlay,
  ClipboardList,
  FileDown,
  FileSignature,
  Link2Off,
  PhoneCall,
  Plus,
  Search,
  Send,
  TrendingDown,
  Users,
  UserX,
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
import { AttendanceBadge, CERTIFICATE_PERCENT, PercentBadge } from '@/components/studentPortal/AttendanceBadge'
import { AttendanceRegister } from '@/components/studentPortal/AttendanceRegister'
import { ClassSessionModal } from '@/components/studentPortal/ClassSessionModal'
import { ClassRosterModal } from '@/components/studentPortal/ClassRosterModal'
import { PortalStudentModal } from '@/components/studentPortal/PortalStudentModal'
import { AbsenteesPanel } from '@/components/studentPortal/AbsenteesPanel'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { formatDate, titleCase } from '@/utils/formatters'

const STATUS_TONES = { active: 'green', on_hold: 'amber', completed: 'blue', dropped: 'red' }

// The stage row, in the order a student moves through the portal - their link
// goes out, they sign the terms, they attend - so the row reads as the process
// left to right, like the lead boards' stage rows. Each card filters the
// student list. A dropped student is only under Dropped: the others are about
// the students still on the course.
const STAGES = [
  { key: 'all', label: 'All Students', tone: 'brand', icon: Users, empty: 'No students in this batch yet.' },
  {
    key: 'no_link',
    label: 'Link Not Sent',
    tone: 'violet',
    icon: Link2Off,
    empty: 'Every student has been sent their link.',
  },
  { key: 'awaiting', label: 'Awaiting Signature', tone: 'amber', icon: Send, empty: 'Nobody is waiting to sign.' },
  { key: 'signed', label: 'T&C Signed', tone: 'emerald', icon: FileSignature, empty: 'Nobody has signed yet.' },
  {
    key: 'low',
    label: 'Low Attendance',
    tone: 'rose',
    icon: TrendingDown,
    empty: `Everyone is at ${CERTIFICATE_PERCENT}% attendance or above.`,
  },
  { key: 'dropped', label: 'Dropped', tone: 'slate', icon: UserX, empty: 'Nobody has dropped out.' },
]

function inStage(row, stage) {
  if (stage === 'dropped') return row.status === 'dropped'
  if (row.status === 'dropped') return false
  if (stage === 'no_link') return !row.terms_signed && !row.has_link
  if (stage === 'awaiting') return !row.terms_signed && row.has_link
  if (stage === 'signed') return row.terms_signed
  // Only once a class has been held - nobody is behind on nothing.
  if (stage === 'low') return row.totals.percent !== null && row.totals.percent < CERTIFICATE_PERCENT
  return true
}

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
    // Named as the stage cards name them, so a badge and its card agree.
    key: 'terms',
    header: 'T&C',
    render: (row) =>
      row.terms_signed ? (
        <Badge tone="emerald">Signed {formatDate(row.terms_accepted_at)}</Badge>
      ) : row.has_link ? (
        <Badge tone="amber">Awaiting signature</Badge>
      ) : (
        <Badge tone="violet">Link not sent</Badge>
      ),
  },
  {
    key: 'percent',
    header: 'Attendance',
    render: (row) =>
      row.totals.held ? (
        <span className="inline-flex items-center gap-2">
          <PercentBadge percent={row.totals.percent} />
          <span className="text-xs tabular-nums text-slate-500">
            {row.totals.attended} of {row.totals.held}
          </span>
        </span>
      ) : (
        <span className="text-xs text-slate-400">No classes yet</span>
      ),
  },
  {
    key: 'via',
    header: 'How Attended',
    render: (row) =>
      row.totals.attended ? (
        <span className="text-xs tabular-nums text-slate-600">
          {[
            row.totals.live && `${row.totals.live} live`,
            row.totals.recording && `${row.totals.recording} recording`,
            row.totals.manual && `${row.totals.manual} marked`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
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

// One line saying what it means for today's work, with the server setup folded
// away behind it: the setup is for whoever configures the server, and spelled
// out in full it was the loudest thing on the board for everyone else.
function SyncNotice() {
  return (
    <details className="group rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="flex-1">
          <span className="font-semibold">Automatic attendance is off.</span> Mark attendance by hand for now;
          recordings opened from a student&rsquo;s link still count.
        </span>
        <span className="shrink-0 font-medium text-amber-700 hover:underline">
          <span className="group-open:hidden">Setup details</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <p className="mt-2 border-t border-amber-200 pt-2">
        Live attendance and recording views are read automatically once the server&rsquo;s Google service account has
        domain-wide delegation for <span className="font-mono">admin.reports.audit.readonly</span> and{' '}
        <span className="font-mono">GOOGLE_MEET_ADMIN_EMAIL</span> is set - the same setup the Success Meet sync uses.
      </p>
    </details>
  )
}

function BatchBoard({ batchId, canMark, canManage }) {
  const refresh = usePortalRefresh()
  const [tab, setTab] = useState('students')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('all')
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
        inStage(row, stage) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          (row.email ?? '').toLowerCase().includes(needle) ||
          (row.phone ?? '').includes(needle)),
    )
  }, [data, search, stage])

  if (query.isLoading) return <LoadingSpinner />
  if (query.isError) return <ErrorMessage message={getApiErrorMessage(query.error)} />

  const { sessions } = data
  const heldCount = sessions.filter((session) => session.held).length
  const counts = Object.fromEntries(
    STAGES.map((entry) => [entry.key, data.students.filter((row) => inStage(row, entry.key)).length]),
  )
  const percents = data.students
    .filter((row) => row.status !== 'dropped' && row.totals.percent !== null)
    .map((row) => row.totals.percent)
  const average = percents.length ? Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length) : null
  const nextSequence = sessions.reduce((max, session) => Math.max(max, session.sequence), 0) + 1
  const editingSession = sessions.find((session) => session.id === rosterSessionId)
  const activeStage = STAGES.find((entry) => entry.key === stage)
  // The batch's average sits on the Low Attendance card, the figure it's read against.
  const hints = {
    low: !heldCount
      ? 'No classes held yet'
      : `Under ${CERTIFICATE_PERCENT}%${average === null ? '' : ` · average ${average}%`}`,
  }
  const tabs = [
    { key: 'students', label: 'Students', icon: Users },
    // The attendance sheet, as it was kept by hand - now filled from Meet.
    { key: 'register', label: 'Register', icon: ClipboardList },
    {
      key: 'classes',
      label: sessions.length ? `Classes · ${heldCount} of ${sessions.length} held` : 'Classes',
      icon: CalendarDays,
    },
    { key: 'absentees', label: 'Absentees', icon: PhoneCall },
  ]

  return (
    <div className="space-y-4">
      {!data.sync_configured && <SyncNotice />}

      {/* One row of equal columns once there's room, as on the lead boards;
          it wraps on a phone or a narrow window. */}
      <div className="@container">
        <div className="flex flex-wrap gap-3 @min-[64rem]:grid @min-[64rem]:auto-cols-fr @min-[64rem]:grid-flow-col @min-[64rem]:gap-2">
          {STAGES.map((entry) => (
            <StatCard
              key={entry.key}
              label={entry.label}
              value={counts[entry.key]}
              toneName={entry.tone}
              icon={entry.icon}
              hint={hints[entry.key]}
              isActive={tab === 'students' && stage === entry.key}
              onClick={() => {
                // A stage is a filter on the student list, so picking one from
                // Classes or Absentees brings the list back to show it.
                setTab('students')
                setStage(entry.key)
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabStrip tabs={tabs} value={tab} onChange={setTab} />
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
            {stage !== 'all' && (
              <button
                type="button"
                onClick={() => setStage('all')}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Showing {activeStage.label} · show all
              </button>
            )}
            {/* Says what a row is for: nothing else on the board does, and the
                link, the signature and the attendance all live behind it. */}
            <p className="ml-auto text-xs text-slate-400">
              Click a student to send their link, record a signature or see their attendance.
            </p>
          </div>
          <DataTable
            columns={studentColumns}
            rows={students}
            emptyMessage={
              search.trim()
                ? 'No student matches.'
                : stage === 'low' && !heldCount
                  ? 'No classes have been held yet.'
                  : activeStage.empty
            }
            onRowClick={(row) => setStudentId(row.id)}
          />
        </TableCard>
      )}
      {tab === 'register' && <AttendanceRegister batchId={batchId} canMark={canMark} />}
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
 * Every lead at Batch Confirmation is a student here, in the batch the leads
 * page shows it in; the server enrols them as the batch list loads.
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
        <p className="text-sm font-medium text-slate-800">No enrolled students yet.</p>
        <p className="mt-1 text-sm text-slate-500">
          A lead appears here as a student once it reaches Batch Confirmation, in the batch the leads page shows it in.
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
