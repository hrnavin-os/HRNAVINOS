import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  FileSignature,
  GraduationCap,
  ListChecks,
  Search,
  Sparkles,
  Undo2,
  X,
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
import { formatDate, formatDateTime } from '@/utils/formatters'

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
    label: 'Terms & Condition',
    icon: FileSignature,
    yes: 'Signed',
    no: 'Not signed',
    action: 'Mark signed',
  },
  {
    key: 'polls',
    tone: 'violet',
    label: 'Polls',
    icon: ListChecks,
    yes: 'Selected',
    no: 'Not selected',
    action: 'Mark selected',
  },
  {
    key: 'success_meet',
    tone: 'amber',
    label: 'Success Meet',
    icon: Sparkles,
    yes: 'Attended',
    no: 'Not attended',
    action: 'Mark attended',
  },
  {
    key: 'foundation_class',
    tone: 'emerald',
    label: 'Foundation Class',
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

// Which side of the open marker the table is showing. All is first because it
// is the roll; the other two are that same list split, and their counts add
// back up to it.
//
// The two sides borrow the open marker's own words - "Signed"/"Not signed",
// "Attended"/"Not attended" - rather than a generic Marked/Pending. The
// segment says what it filters to, which is the thing a reader wants named.
const STATES = ['all', 'yes', 'no']

const stateLabel = (key, tab) => (key === 'all' ? 'All students' : key === 'yes' ? tab.yes : tab.no)

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
export function InductionAttendancePage() {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canMark = hasPermission(PERMISSIONS.INDUCTION_ATTENDANCE_MARK)

  const [marker, setMarker] = useState('terms')
  const [state, setState] = useState('all')
  const [section, setSection] = useState('')
  const [batch, setBatch] = useState('')
  const [error, setError] = useState(null)

  // undefined rather than '' for an unset filter: the API treats a missing
  // param as "no filter", where an empty string would be a section nobody is
  // in and return nothing.
  const filters = { section: section || undefined, batch: batch || undefined }

  const query = usePaginatedQuery('induction-attendance', attendanceBoardService, {
    marker,
    state,
    ...filters,
  })
  const { setPage, search, setSearch } = query

  // A page number belongs to the view it was set on: page 3 of the whole roll
  // is not page 3 of the four people still pending in B Section.
  useEffect(() => {
    setPage(1)
  }, [marker, state, section, batch, setPage])

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

  const setMark = useMutation({
    mutationFn: ({ id, marked }) => attendanceBoardService.setMark(id, marker, marked),
    onSuccess: () => {
      // Both sides of the split change when a student is marked, and so does
      // every count - including the other tabs', since one row can move on
      // more than one marker over a session.
      queryClient.invalidateQueries({ queryKey: ['induction-attendance'] })
      queryClient.invalidateQueries({ queryKey: ['induction-attendance-stats'] })
    },
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
        {mark.source !== 'none' && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {mark.source === 'auto' ? (
              <span className="inline-flex items-center gap-0.5">
                <Zap className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Automatic
              </span>
            ) : (
              <>
                {mark.at ? formatDateTime(mark.at) : ''}
                {mark.by_name ? ` · ${mark.by_name}` : ''}
              </>
            )}
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
    { key: 'batch', header: 'Batch', align: 'center' },
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
        return (
          <Button
            variant={isYes ? 'ghost' : 'success'}
            className="whitespace-nowrap px-2.5! py-1! text-xs"
            disabled={setMark.isPending}
            // An automatic yes is corrected to an explicit no; a manual answer
            // is cleared back to nothing. Undoing a tick and contradicting the
            // data are different acts, and this is the one button for both.
            onClick={() =>
              setMark.mutate({ id: row.id, marked: isYes ? (mark.source === 'auto' ? false : null) : true })
            }
          >
            {isYes ? (
              <>
                {mark.source === 'auto' ? (
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                )}
                {mark.source === 'auto' ? `Mark ${active.no.toLowerCase()}` : 'Undo'}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                {active.action}
              </>
            )}
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Attendance</h1>
              <p className="text-[11px] font-medium text-amber-600">
                Terms, polls, success meet and foundation class across the induction list
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            {query.total} {query.total === 1 ? 'student' : 'students'}
          </span>
        </div>

        {/* The four markers as cards rather than a tab strip: each one is a
            figure as much as a destination - how many of the roll have signed,
            been selected, turned up - and a tab strip can only whisper that in
            brackets after a label. The open one fills solid, the way the
            induction and section card rows select. */}
        <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
          {TABS.map((tab) => {
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
              second card row, so the two levels don't read as equals. */}
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

          {/* Divider: what the table is showing on the left of it, what
              narrows the roll on the right. */}
          {(sectionOptions.length > 1 || batchOptions.length > 1) && (
            <span className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          )}

          {sectionOptions.length > 1 && (
            <FilterDropdown label="Section" value={section} options={sectionOptions} onChange={setSection} />
          )}
          {batchOptions.length > 1 && (
            <FilterDropdown label="Batch" value={batch} options={batchOptions} onChange={setBatch} />
          )}

          {/* Only once something is set, and it clears everything the row
              holds - hunting three controls to get back to the whole roll is
              the cost a filter row otherwise quietly charges. */}
          {(section || batch || search) && (
            <button
              type="button"
              onClick={() => {
                setSection('')
                setBatch('')
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
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={
            state === 'yes'
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

      <Toast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
