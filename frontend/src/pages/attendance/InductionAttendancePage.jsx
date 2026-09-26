import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  FileSignature,
  GraduationCap,
  ListChecks,
  MessageSquarePlus,
  Search,
  Sparkles,
  Undo2,
  Users,
  Video,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { attendanceBoardService } from '@/services/attendanceBoardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { PERMISSIONS } from '@/constants/permissions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { StatCard } from '@/components/ui/StatCard'
import { TableCard } from '@/components/ui/TableCard'
import { Toast } from '@/components/ui/Toast'
import { FoundationGroupBadge } from '@/components/leads/FoundationGroupBadge'
import { PollFollowUpModal } from '@/components/attendance/PollFollowUpModal'
import { MeetSyncModal } from '@/components/attendance/MeetSyncModal'
import { StudentAttendanceModal } from '@/components/attendance/StudentAttendanceModal'
import { FOUNDATION_GROUP_OPTIONS } from '@/constants/foundationGroups'
import { formatDate, formatDateTime, formatMinutes as minutes } from '@/utils/formatters'

// The four markers, in the order they happen to a student: they sign the
// terms, they are picked in the poll, they come to the success meet, they come
// to the foundation class.
//
// `key` must match a key in the backend's MARKERS registry - that map is what
// each marker means in storage, and this is only the menu of them.
const TABS = [
  {
    key: 'terms',
    tone: 'brand',
    label: 'Terms & Conditions',
    caption: 'Who has signed the terms & conditions',
    icon: FileSignature,
    yes: 'Signed',
    no: 'Not signed',
    action: 'Mark signed',
  },
  {
    key: 'polls',
    tone: 'violet',
    label: 'Polls',
    caption: 'Who was selected in the polls, and why the rest were not',
    icon: ListChecks,
    yes: 'Selected',
    no: 'Not selected',
    action: 'Mark selected',
  },
  {
    key: 'success_meet',
    tone: 'amber',
    label: 'Success Meet',
    caption: 'Who came to the success meet',
    icon: Sparkles,
    yes: 'Attended',
    no: 'Not attended',
    action: 'Mark attended',
  },
  {
    key: 'foundation_class',
    tone: 'emerald',
    label: 'Foundation Class',
    caption: 'Who came to the foundation class',
    icon: GraduationCap,
    yes: 'Attended',
    no: 'Not attended',
    action: 'Mark attended',
    // Answered by the data: an entry linked to a Foundation Form submission
    // got there through the foundation class, and the link is already made on
    // mobile-number match. Ticking is only ever a correction here.
    auto: 'Filled in automatically from the Foundation board — anyone whose induction entry reached a Foundation Form submission counts as attended. Mark by hand only to correct it.',
  },
]

const TAB_BY_KEY = Object.fromEntries(TABS.map((tab) => [tab.key, tab]))

// Attendance read from a Google Meet call (MeetSyncModal). Only these two are
// meetings.
const MEET_MARKERS = new Set(['success_meet', 'foundation_class'])

// Which side of the open marker the table is showing. All is first because it
// is the roll; the other two are that same list split, and their counts add
// back up to it.
//
// The two sides borrow the open marker's own words - "Signed"/"Not signed",
// "Attended"/"Not attended" - rather than a generic Marked/Pending. The
// segment says what it filters to, which is the thing a reader wants named.
const STATES = ['all', 'yes', 'no']

const stateLabel = (key, tab) => (key === 'all' ? 'All students' : key === 'yes' ? tab.yes : tab.no)

// The Polls tab's not-selected side, split by whether a section admin has rung
// the student yet. Values are the API's `follow_up` param.
const FOLLOW_UP_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'To follow up' },
  { value: 'done', label: 'Followed up' },
]

// Admin > Attendance: the induction programme's four markers against the
// induction roll.
//
// The roll is the induction list - everyone who came through an induction
// call, whatever has become of them since - because that is who is asked to
// sign and to turn up. It is not the Students collection, which only fills up
// once a batch is confirmed and would therefore be missing most of the people
// being chased.
//
// Every marker travels on every row, so the columns show all four at once and
// the tabs decide which one the action button and the Marked/Pending filter
// are about. Switching tabs is not a new question about different people.
//
// `only` fixes the board to one marker - the Section Admins' Polls menu is
// this page with only="polls".
export function InductionAttendancePage({ only }) {
  const { hasPermission, user } = useAuth()
  const queryClient = useQueryClient()
  const canMark = hasPermission(PERMISSIONS.INDUCTION_ATTENDANCE_MARK)

  const tabs = only ? TABS.filter((tab) => tab.key === only) : TABS
  const [marker, setMarker] = useState(only ?? 'terms')
  const [state, setState] = useState('all')
  const [section, setSection] = useState('')
  const [batch, setBatch] = useState('')
  // Which of the month's two foundation classes. Narrows a batch rather than
  // cutting across one - both groups are the same batch - so it sits beside
  // the Batch filter and is read from the same registration date.
  const [group, setGroup] = useState('')
  const [error, setError] = useState(null)
  // Polls, "Not selected" side only: everyone not selected, only those nobody
  // has followed up yet, or only those somebody has.
  const [followUp, setFollowUp] = useState('')
  // The student whose follow-up popup is open.
  const [followingUp, setFollowingUp] = useState(null)
  const [meetOpen, setMeetOpen] = useState(false)
  // The student whose row was clicked, for the detail popup. Kept as the row
  // itself, and read back from the current page when it is still on it, so a
  // mark made meanwhile shows in the popup too.
  const [viewing, setViewing] = useState(null)

  // undefined rather than '' for an unset filter: the API treats a missing
  // param as "no filter", where an empty string would be a section nobody is
  // in and return nothing.
  const filters = { section: section || undefined, batch: batch || undefined, group: group || undefined }
  const isPolls = marker === 'polls'

  const query = usePaginatedQuery('induction-attendance', attendanceBoardService, {
    marker,
    state,
    ...filters,
    follow_up: isPolls && state === 'no' && followUp ? followUp : undefined,
  })
  // A page number belongs to the view it was set on - page 3 of the whole roll
  // is not page 3 of the four people still pending in B Section - which
  // usePaginatedQuery now keeps straight for every board at once, from the
  // params above. This page used to do it here in an effect, which reset after
  // the stale page had already been fetched.
  const { setPage, search, setSearch } = query

  const statsQuery = useQuery({
    // The counts are filtered with the table, so they key off the filters too
    // - otherwise the tabs would describe a population the rows don't.
    queryKey: ['induction-attendance-stats', filters],
    queryFn: () => attendanceBoardService.getStats(filters),
  })
  const stats = statsQuery.data

  // Only the sections and batches actually on the roll. A Section Admin is
  // pinned to their own section by their role, so the filter isn't offered to
  // them rather than offered and then ignored.
  const optionsQuery = useQuery({
    queryKey: ['induction-attendance-filter-options'],
    queryFn: attendanceBoardService.getFilterOptions,
  })
  const sectionOptions = (optionsQuery.data?.sections ?? []).map((code) => ({
    value: code,
    label: `${code.toUpperCase()} Section`,
  }))
  const batchOptions = (optionsQuery.data?.batches ?? []).map((value) => ({ value, label: value }))
  const active = TAB_BY_KEY[marker]
  const activeStats = stats?.markers?.[marker]

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['induction-attendance'] })
    queryClient.invalidateQueries({ queryKey: ['induction-attendance-stats'] })
  }

  const setMark = useMutation({
    mutationFn: ({ id, marked }) => attendanceBoardService.setMark(id, marker, marked),
    // Both sides of the split change when a student is marked, and so does
    // every count - including the other tabs', since one row can move on more
    // than one marker over a session.
    onSuccess: refresh,
    onError: (mutationError) => setError(`Couldn't save the mark: ${getApiErrorMessage(mutationError)}`),
  })

  // One marker's cell: the value, and underneath it who said so and when. An
  // automatic answer says so instead of naming somebody who never ticked it.
  function markCell(row, tab) {
    const mark = row.marks?.[tab.key]
    if (!mark) return <span className="text-slate-400">—</span>
    return (
      <div className="min-w-0">
        <Badge tone={mark.marked ? 'emerald' : 'amber'}>{mark.marked ? tab.yes : tab.no}</Badge>
        {(mark.source === 'auto' || mark.source === 'meet') && (
          <p className="mx-auto mt-0.5 max-w-44 truncate text-[11px] text-slate-400">
            {mark.source === 'auto' ? (
              <span className="inline-flex items-center gap-0.5">
                <Zap className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Automatic
              </span>
            ) : mark.source === 'meet' ? (
              <span
                className="inline-flex items-center gap-0.5"
                title={
                  mark.meet_joined_at
                    ? `Joined ${formatDateTime(mark.meet_joined_at)} · left ${formatDateTime(mark.meet_left_at)}`
                    : undefined
                }
              >
                <Video className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Google Meet · {minutes(mark.meet_duration_seconds)}
              </span>
            ) : null}
          </p>
        )}
      </div>
    )
  }

  const columns = [
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
    {
      key: 'section',
      header: 'Section',
      align: 'center',
      render: (row) =>
        row.section ? (
          <Badge tone="blue">{row.section.toUpperCase()} Section</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    // Batch and group in one cell, stacked like the student's name and phone:
    // they are read as a pair - "Group 2 of Batch-28" - and two columns for
    // them pushed the table wider than the screen. Read-only here; the group
    // is set on the Induction board and on Foundation.
    {
      key: 'batch',
      header: 'Batch · Group',
      align: 'center',
      render: (row) => (
        <div className="flex flex-col items-center gap-1">
          <span>{row.batch ?? '—'}</span>
          <FoundationGroupBadge group={row.foundation_group} history={row.foundation_group_history} />
        </div>
      ),
    },
    {
      key: 'registration_date',
      header: 'Registered',
      align: 'center',
      render: (row) => formatDate(row.registration_date),
    },
    // One marker column: the open tab's. All four at once meant a table wider
    // than the screen, so reading any single one - which is what a tab is for
    // - cost a horizontal scroll past three columns nobody had asked about.
    {
      key: active.key,
      header: active.label,
      align: 'center',
      render: (row) => markCell(row, active),
    },
    {
      key: 'action',
      header: '',
      align: 'center',
      render: (row) => {
        if (!canMark) return null
        const mark = row.marks?.[marker]
        const isYes = Boolean(mark?.marked)
        // Answered by the data - the Foundation link, or a Google Meet call -
        // rather than by a person. Undoing it is a correction to an explicit
        // no, which the next sync must leave alone; clearing it would only
        // hand the row straight back to the data.
        const fromData = mark?.source === 'auto' || mark?.source === 'meet'
        const markButton = (
          <Button
            variant={isYes ? 'ghost' : 'success'}
            className="whitespace-nowrap px-2.5! py-1! text-xs"
            disabled={setMark.isPending}
            // An automatic yes is corrected to an explicit no; a manual answer
            // is cleared back to nothing. Undoing a tick and contradicting the
            // data are different acts, and this is the one button for both.
            onClick={() =>
              setMark.mutate({ id: row.id, marked: isYes ? (fromData ? false : null) : true })
            }
          >
            {isYes ? (
              <>
                {fromData ? (
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                )}
                {fromData ? `Mark ${active.no.toLowerCase()}` : 'Undo'}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                {active.action}
              </>
            )}
          </Button>
        )
        // A student not selected in the poll is one to ring and ask why -
        // the follow-up sits beside the tick, so both outcomes of the call are
        // one click away.
        if (!isPolls || isYes) return markButton
        return (
          <div className="flex items-center justify-center gap-1.5">
            {/* Icon only; the remarks themselves are in the popup it opens. The
                count says how many calls there have been, so a student already
                rung is told apart from one nobody has. */}
            <Button
              variant="secondary"
              className="relative px-2! py-1!"
              onClick={() => setFollowingUp(row)}
              title={
                row.poll_follow_ups?.length
                  ? `Follow up · ${row.poll_follow_ups.length} earlier`
                  : 'Follow up · not followed up yet'
              }
              aria-label="Follow up"
            >
              <MessageSquarePlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {row.poll_follow_ups?.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                  {row.poll_follow_ups.length}
                </span>
              )}
            </Button>
            {markButton}
          </div>
        )
      },
    },
  ]

  // A marker board fixed to one marker (the Section Admins' Polls menu) has
  // no marker to choose, so its cards are the marker's own split instead:
  // everyone, the ones done, the ones not. They replace the segmented control
  // that does the same job on the full board.
  const followedUp = stats?.polls_followed_up ?? 0
  const splitCards = activeStats
    ? [
        {
          key: 'all',
          label: 'All students',
          value: activeStats.total,
          hint: 'on the induction list',
          tone: 'brand',
          icon: Users,
        },
        {
          key: 'yes',
          label: active.yes,
          value: activeStats.yes,
          hint: activeStats.total ? `${Math.round((activeStats.yes / activeStats.total) * 100)}% of students` : null,
          tone: 'emerald',
          icon: CheckCircle2,
        },
        {
          key: 'no',
          label: active.no,
          value: activeStats.no,
          hint: isPolls
            ? `${followedUp} followed up · ${Math.max(activeStats.no - followedUp, 0)} to call`
            : activeStats.total
              ? `${Math.round((activeStats.no / activeStats.total) * 100)}% of students`
              : null,
          tone: 'amber',
          icon: XCircle,
        },
      ]
    : []

  return (
    <div>
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                {only ? TAB_BY_KEY[only].label : 'Attendance'}
              </h1>
              <p className="text-[11px] font-medium text-amber-600">
                {only
                  ? `${TAB_BY_KEY[only].caption}, across ${user?.scoped_section ? "your section's" : 'the'} induction list`
                  : 'Terms, polls, success meet and foundation class across the induction list'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* The meetings this page's attendance is read from. Beside the
                count rather than in the toolbar: it is where the marks come
                from, not a way of narrowing the table. */}
            {only && MEET_MARKERS.has(only) && canMark && (
              <Button variant="secondary" className="px-2.5! py-1! text-xs" onClick={() => setMeetOpen(true)}>
                <Video className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Google Meet
              </Button>
            )}
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
              {query.total} {query.total === 1 ? 'student' : 'students'}
            </span>
          </div>
        </div>

        {/* The four markers as cards rather than a tab strip: each one is a
            figure as much as a destination - how many of the roll have signed,
            been selected, turned up - and a tab strip can only whisper that in
            brackets after a label. The open one fills solid, the way the
            induction and section card rows select. */}
        <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          {only
            ? splitCards.map((card) => (
                <StatCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  toneName={card.tone}
                  icon={card.icon}
                  isActive={state === card.key}
                  onClick={() => {
                    setState(card.key)
                    setFollowUp('')
                  }}
                />
              ))
            : tabs.map((tab) => {
                const split = stats?.markers?.[tab.key]
                return (
                  <StatCard
                    key={tab.key}
                    label={tab.label}
                    value={split ? split.yes : '—'}
                    hint={split ? `of ${split.total} students` : null}
                    toneName={tab.tone}
                    icon={tab.icon}
                    isActive={marker === tab.key}
                    onClick={() => setMarker(tab.key)}
                  />
                )
              })}
        </div>

        {/* The toolbar. One 36px control height across the segmented control,
            both filters and the search box, so the row lines up on both edges
            - the thing that separates a toolbar from a handful of controls
            that happen to sit on the same line. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          {/* The split of the open marker. A segmented control rather than a
              second card row, so the two levels don't read as equals. On a
              one-marker board the cards above are that split, so it isn't
              repeated here. */}
          {!only && (
          <div
            role="group"
            aria-label="Filter by mark"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white p-0.5 shadow-sm"
          >
            {STATES.map((key) => {
              const isActive = state === key
              const count = key === 'yes' ? activeStats?.yes : key === 'no' ? activeStats?.no : null
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setState(key)}
                  aria-pressed={isActive}
                  className={`flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors ${
                    isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {stateLabel(key, active)}
                  {/* The count as a subordinate chip rather than loose digits:
                      it qualifies the segment's label, and at the same weight
                      the two read as one long name. */}
                  {count !== undefined && count !== null && (
                    <span
                      className={`rounded px-1 text-[11px] font-semibold tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          )}

          {/* Polls, not-selected side: who still needs ringing. The students a
              section admin follows up are exactly these, so the split is
              offered here rather than as another card. */}
          {isPolls && state === 'no' && (
            <div
              role="group"
              aria-label="Filter by follow-up"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white p-0.5 shadow-sm"
            >
              {FOLLOW_UP_FILTERS.map((option) => {
                const isActive = followUp === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFollowUp(option.value)}
                    aria-pressed={isActive}
                    className={`flex h-8 items-center rounded px-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Divider: what the table is showing on the left of it, what
              narrows the roll on the right. */}
          {(!only || (isPolls && state === 'no')) && (
            <span className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          )}

          {sectionOptions.length > 1 && (
            <FilterDropdown label="Section" value={section} options={sectionOptions} onChange={setSection} />
          )}
          {batchOptions.length > 1 && (
            <FilterDropdown label="Batch" value={batch} options={batchOptions} onChange={setBatch} />
          )}
          {/* Always offered, unlike the two above: there are exactly two groups
              in every batch by definition, so the options can't be read off the
              roll the way sections and batches are - and a month with nobody in
              its second half is a fact worth being able to ask for. */}
          <FilterDropdown
            label="Group"
            value={group}
            options={FOUNDATION_GROUP_OPTIONS}
            onChange={setGroup}
          />

          {/* Only once something is set, and it clears everything the row
              holds - hunting three controls to get back to the whole roll is
              the cost a filter row otherwise quietly charges. */}
          {(section || batch || group || search) && (
            <button
              type="button"
              onClick={() => {
                setSection('')
                setBatch('')
                setGroup('')
                setSearch('')
                setPage(1)
              }}
              className="flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Clear
            </button>
          )}

          {/* Search sits at the far end, where every toolbar in the app puts
              it, and keeps its width rather than growing into the gap. */}
          <div className="w-full sm:ml-auto sm:w-64">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by name, phone, email…"
              rightElement={<Search className="h-4 w-4 text-slate-400" aria-hidden="true" />}
            />
          </div>
        </div>

        {active.auto && (
          <p className="flex items-start gap-1.5 border-t border-slate-200 bg-brand-50/60 px-4 py-2 text-[11px] text-brand-800">
            <Zap className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            {active.auto}
          </p>
        )}
      </div>

      <TableCard>
        <DataTable
          columns={columns}
          rows={query.items}
          // The row opens the student's whole attendance: all four markers, who
          // marked each and when, and the poll follow-ups - the details the
          // table leaves out. Its buttons still act on their own.
          onRowClick={setViewing}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={
            isPolls && state === 'no' && followUp === 'pending'
              ? 'Every student not selected has been followed up.'
              : isPolls && state === 'no' && followUp === 'done'
                ? 'Nobody has been followed up yet.'
                : state === 'yes'
              ? `Nobody is marked as ${active.yes.toLowerCase()} yet.`
              : state === 'no'
                ? `Everyone on the induction list is ${active.yes.toLowerCase()}.`
                : 'No students on the induction list yet.'
          }
        />
        <Pagination
          page={query.page}
          totalPages={query.totalPages}
          onPageChange={setPage}
          total={query.total}
          pageSize={query.pageSize}
        />
      </TableCard>

      {viewing && (
        <StudentAttendanceModal
          student={query.items?.find((item) => item.id === viewing.id) ?? viewing}
          tabs={TABS}
          current={marker}
          onClose={() => setViewing(null)}
        />
      )}

      {meetOpen && (
        <MeetSyncModal
          marker={only}
          label={TAB_BY_KEY[only].label}
          onClose={() => setMeetOpen(false)}
          // A sync moves marks, so the cards and the table re-read.
          onSynced={refresh}
        />
      )}

      {followingUp && (
        <PollFollowUpModal student={followingUp} onClose={() => setFollowingUp(null)} onSaved={refresh} />
      )}

      <Toast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
