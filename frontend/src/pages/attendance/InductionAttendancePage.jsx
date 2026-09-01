import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileSignature,
  GraduationCap,
  ListChecks,
  Pencil,
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
import { Input, FIELD } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { TabStrip } from '@/components/ui/TabStrip'
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
    label: 'Terms & Condition',
    icon: FileSignature,
    yes: 'Signed',
    no: 'Not signed',
    action: 'Mark signed',
  },
  {
    key: 'polls',
    label: 'Polls',
    icon: ListChecks,
    yes: 'Selected',
    no: 'Not selected',
    action: 'Mark selected',
  },
  {
    key: 'success_meet',
    label: 'Success Meet',
    icon: Sparkles,
    yes: 'Attended',
    no: 'Not attended',
    action: 'Mark attended',
  },
  {
    key: 'foundation_class',
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
const STATES = [
  { key: 'all', label: 'All students' },
  { key: 'yes', label: 'Marked' },
  { key: 'no', label: 'Pending' },
]

// The terms text itself, shown on the Terms tab - so whoever is chasing
// signatures can read what is being agreed to without going and finding the
// document. Collapsed by default: it is reference material, and the roll is
// the working surface.
function TermsDocumentPanel({ canEdit, onError }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['terms-document'],
    queryFn: attendanceBoardService.getTermsDocument,
  })
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const save = useMutation({
    mutationFn: () => attendanceBoardService.updateTermsDocument({ title: title.trim(), body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['terms-document'], updated)
      setIsEditing(false)
    },
    onError: (error) => onError(`Couldn't save the terms: ${getApiErrorMessage(error)}`),
  })

  function startEditing() {
    setTitle(data?.title ?? '')
    setBody(data?.body ?? '')
    setIsEditing(true)
    setIsOpen(true)
  }

  const hasBody = Boolean(data?.body?.trim())

  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span className="h-8 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">
              {data?.title || 'Terms & Conditions'}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {hasBody
                ? data?.updated_at
                  ? `Last updated ${formatDate(data.updated_at)}${
                      data.updated_by_name ? ` by ${data.updated_by_name}` : ''
                    }`
                  : 'The document students are signing'
                : 'No terms written yet'}
            </span>
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        {canEdit && !isEditing && (
          <Button variant="secondary" className="px-2.5! py-1.5! text-xs" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {hasBody ? 'Edit terms' : 'Write terms'}
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 px-4 py-3">
          {isEditing ? (
            <>
              <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Terms</span>
                <textarea
                  rows={12}
                  maxLength={20000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type the terms students are agreeing to…"
                  className={`${FIELD} resize-y py-2 leading-relaxed`}
                />
              </label>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{body.length}/20000</span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="px-3! py-1.5! text-xs"
                    onClick={() => setIsEditing(false)}
                    disabled={save.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="px-3! py-1.5! text-xs"
                    onClick={() => save.mutate()}
                    disabled={save.isPending || !title.trim()}
                  >
                    {save.isPending ? 'Saving…' : 'Save terms'}
                  </Button>
                </div>
              </div>
            </>
          ) : hasBody ? (
            // Pre-wrapped rather than rendered as markup: the document is
            // stored as plain text, and the line breaks whoever wrote it put
            // in are the only formatting it has.
            <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {data.body}
            </p>
          ) : (
            <p className="py-4 text-center text-xs text-slate-400">
              Nothing written yet.{canEdit ? ' Use Write terms to add the document students sign.' : ''}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

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
  const canEdit = hasPermission(PERMISSIONS.INDUCTION_ATTENDANCE_CONFIGURE)

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
          <TabStrip
            equal
            // The count rides in the tab, so how much each marker is missing is
            // readable without opening it.
            tabs={TABS.map((tab) => ({
              ...tab,
              label: stats?.markers?.[tab.key]
                ? `${tab.label} (${stats.markers[tab.key].yes}/${stats.markers[tab.key].total})`
                : tab.label,
            }))}
            value={marker}
            onChange={setMarker}
            className="min-w-0 flex-1 basis-2xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          {/* The split of the open marker. A segmented control rather than a
              second tab strip, so the two levels don't read as equals. */}
          <div role="group" aria-label="Filter by mark" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {STATES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setState(option.key)}
                aria-pressed={state === option.key}
                className={`rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  state === option.key ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {option.label}
                {activeStats && option.key !== 'all' && (
                  <span className="ml-1 font-semibold">
                    {option.key === 'yes' ? activeStats.yes : activeStats.no}
                  </span>
                )}
              </button>
            ))}
          </div>
          {sectionOptions.length > 1 && (
            <FilterDropdown
              label="Section"
              value={section}
              options={sectionOptions}
              onChange={setSection}
            />
          )}
          {batchOptions.length > 1 && (
            <FilterDropdown label="Batch" value={batch} options={batchOptions} onChange={setBatch} />
          )}
          <div className="w-full sm:w-56">
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
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            {query.total} {query.total === 1 ? 'student' : 'students'}
          </span>
        </div>

        {active.auto && (
          <p className="flex items-start gap-1.5 border-t border-slate-200 bg-brand-50/60 px-4 py-2 text-[11px] text-brand-800">
            <Zap className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            {active.auto}
          </p>
        )}
      </div>

      {/* Only on the Terms tab: the other three have no document behind them,
          and a panel that stayed put would look like it belonged to all four. */}
      {marker === 'terms' && <TermsDocumentPanel canEdit={canEdit} onError={setError} />}

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
