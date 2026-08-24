import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Eye, Pencil, Search } from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { formatDate, titleCase } from '@/utils/formatters'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import { TableCard } from '@/components/ui/TableCard'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { Pagination } from '@/components/ui/Pagination'
import { SortOrderSelect } from '@/components/ui/SortOrderSelect'
import { LeadSectionStageStats, LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { LeadCourseCell } from '@/components/leads/LeadCourseCell'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import { InductionLeadsBoard } from '@/components/leads/InductionLeadsBoard'
import { useLeadBoard } from '@/hooks/useLeadBoard'
import { PAYMENT_PLAN_TONES, CALL_REMARK_OPTIONS, CALL_REMARK_BY_VALUE } from '@/constants/paymentOptions'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'

// Anchors a portaled popup under its trigger, clamped so it never runs off
// the right edge of the viewport (a trigger in the table's rightmost column,
// Remarks, would otherwise push it past screen bounds).
function popupPositionFor(rect, popupWidth, gap = 4) {
  const maxLeft = window.innerWidth - popupWidth - 8
  return { top: rect.bottom + gap, left: Math.max(8, Math.min(rect.left, maxLeft)) }
}

// Splits text into lines of at most `n` words each, so a long query wraps
// predictably instead of running the popup wide.
function wrapEveryNWords(text, n) {
  const words = text.split(/\s+/)
  const lines = []
  for (let i = 0; i < words.length; i += n) {
    lines.push(words.slice(i, i + n).join(' '))
  }
  return lines
}

const EXCLUDED_COURSE_OPTIONS = ['HR Recruitment', 'Nothing']

// A brighter, more differentiated palette for this table's Stage column
// specifically - independent of each stage's shared `tone` name, which the
// stat cards and the Lead Detail modal's stage-picker buttons key their own
// (different) color maps off of, so changing it here can't affect them.
// Every stage is a solid gradient with white text, so the column reads as one
// consistent set rather than one filled chip among pale ones.
//
// Solid fills, not gradients. Each one is the gradient's old `from` stop, which
// is the end the contrast was measured against - so the pills keep exactly the
// ratios below and only lose the darkening toward their right edge.
//
// The step numbers differ per hue on purpose. White text has to stay legible on
// each, and the hues are not equally light at the same step. Matching blue's
// 500 numerically would put white on yellow-500 at 1.92:1 and green-500 at
// 2.28:1, effectively unreadable. These steps were chosen so every fill clears
// 4.5:1 (blue 5.17, red 4.83, yellow 4.92, purple 5.38, green 5.02, orange
// 5.18) - matched by perceived lightness, not by step number. Re-check the
// contrast if you retune these.
const STAGE_CELL_STYLES = {
  new_lead: 'border-transparent bg-blue-600 text-white',
  rnr: 'border-transparent bg-red-600 text-white',
  pre_screening: 'border-transparent bg-yellow-700 text-white',
  financial_approval: 'border-transparent bg-purple-600 text-white',
  batch_confirmation: 'border-transparent bg-green-700 text-white',
  lost: 'border-transparent bg-orange-700 text-white',
}

// Matches Lead.remarks' server-side cap, so an over-long paste is stopped at
// the textarea instead of coming back as an opaque 422.
const REMARKS_MAX_LENGTH = 2000

// Shows just the first 6 characters + "…" so a long query doesn't blow out
// the row height; hovering reveals the full text in a floating popup.
// Portaled to <body> (positioned from the trigger's own bounding rect)
// rather than rendered inline, because DataTable wraps rows in an
// overflow-x-auto container that would otherwise clip it.
function TruncatedText({ text }) {
  const triggerRef = useRef(null)
  const [popupPosition, setPopupPosition] = useState(null)

  if (!text) return <span className="text-slate-400">—</span>
  const trimmed = text.trim()
  if (trimmed.length <= 6) return <span>{trimmed}</span>

  function show() {
    const rect = triggerRef.current.getBoundingClientRect()
    setPopupPosition(popupPositionFor(rect, 200))
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setPopupPosition(null)}
        className="inline-block cursor-default border-b border-dotted border-slate-300"
      >
        {trimmed.slice(0, 6)}…
      </span>
      {popupPosition &&
        createPortal(
          <div
            style={{ top: popupPosition.top, left: popupPosition.left }}
            className="pointer-events-none fixed z-100 w-50 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal text-slate-700 shadow-lg"
          >
            {wrapEveryNWords(trimmed, 4).map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// Staff notes cell - distinct from the read-only Query column (the
// student's own submitted text). Rather than a persistent text box, it's a
// single icon that opens a small popover to type into, submitted with the
// tick button.
//
// The icon states which of the two things the click will do: a pen on an
// empty cell (nothing to read yet - write something), an eye once a remark
// exists (there is something here - come look). Saving invalidates the leads
// query, so the row refetches and the icon flips on its own.
function RemarksCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const [popupPosition, setPopupPosition] = useState(null)
  const [value, setValue] = useState(lead.remarks ?? '')

  // Closes only once the save lands, so a failed request leaves the popup
  // open with the typed text intact to retry rather than silently losing it.
  const mutation = useMutation({
    mutationFn: (remarks) => leadService.update(lead.id, { remarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setPopupPosition(null)
    },
    onError: (error) => onError(`Couldn't save remarks for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  function open(event) {
    event.stopPropagation()
    setValue(lead.remarks ?? '')
    const rect = buttonRef.current.getBoundingClientRect()
    setPopupPosition(popupPositionFor(rect, 288))
  }

  // React routes events from a portal up the *component* tree, not the DOM
  // tree, so a click on this backdrop still reaches whatever the table row
  // has bound unless it's stopped here. Dismissing should only dismiss.
  function close(event) {
    event?.stopPropagation()
    setPopupPosition(null)
  }

  function submit(event) {
    event.stopPropagation()
    mutation.mutate(value)
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        title={lead.remarks || 'Add remarks'}
        aria-label={lead.remarks ? `View remarks for ${lead.name}` : `Add remarks for ${lead.name}`}
        className={`rounded-md p-1.5 transition-colors hover:bg-slate-100 ${
          lead.remarks ? 'text-brand-600 hover:text-brand-700' : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        {lead.remarks ? (
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        )}
      </button>
      {popupPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: popupPosition.top, left: popupPosition.left }}
              className="fixed z-50 w-72 rounded-md border border-slate-200 bg-white p-3 shadow-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <textarea
                autoFocus
                rows={3}
                maxLength={REMARKS_MAX_LENGTH}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Add remarks…"
                className="w-full resize-none rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {value.length}/{REMARKS_MAX_LENGTH}
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={mutation.isPending}
                  aria-label="Save remarks"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

// Inline-editable colored-tag cell - shows the lead's current value as a
// Badge (or a muted placeholder if unset); clicking it opens a portaled
// menu of every option, each previewed as its own colored Badge, matching
// the Google Sheets dropdown this replaces. Used for both Payment Option
// and Payment Call Remarks, which only differ by field name and options.
//
// `displayByValue` is looked up before `options` so a value that's been
// retired from the picker still renders its own label instead of falling
// back to the "Select…" placeholder, which would read as empty data.
function SelectBadgeCell({ lead, field, options, displayByValue, placeholder, onError }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const stored = lead[field]
  const current = displayByValue?.[stored] ?? options.find((option) => option.value === stored)

  const mutation = useMutation({
    mutationFn: (value) => leadService.update(lead.id, { [field]: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) => onError(`Couldn't update ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  function toggle(event) {
    event.stopPropagation()
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPosition(popupPositionFor(rect, 256))
  }

  // See RemarksCell.close - portal clicks bubble through the component tree,
  // so the backdrop has to stop the event from reaching the row behind it.
  function close(event) {
    event?.stopPropagation()
    setMenuPosition(null)
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-full px-1 py-1 hover:bg-slate-50 ${
          current ? '' : 'w-full min-w-36 justify-between border border-slate-200 bg-slate-50 px-3 py-1.5 hover:bg-slate-100'
        }`}
      >
        {current ? <Badge tone={current.tone}>{current.label}</Badge> : <span className="text-sm text-slate-400">{placeholder}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      </button>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, left: menuPosition.left }}
              onClick={(event) => event.stopPropagation()}
              className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
            >
              {/* Clears the field back to unset - without it a value picked
                  by mistake could never be taken off the lead again. */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  mutation.mutate(null)
                  close()
                }}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                  stored ? 'text-slate-500 hover:bg-slate-50' : 'bg-slate-50 font-medium text-slate-600'
                }`}
              >
                {placeholder}
              </button>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    mutation.mutate(option.value)
                    close()
                  }}
                  className={`block w-full rounded px-1 py-1 text-left hover:bg-slate-50 ${
                    stored === option.value ? 'bg-slate-50' : ''
                  }`}
                >
                  <Badge tone={option.tone}>{option.label}</Badge>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

// The two boards read different collections - induction submissions are their
// own records, not Leads - so they're separate components rather than one
// table with a filter. Splitting here also means the Foundation board's
// queries don't run while you're looking at the Induction one.
//
// The switch itself lives in the Topbar (components/layout/LeadBoardTabs) and
// drives a ?board= query param, which is what this reads. That keeps the
// control in the header without either component owning the other's state.
export function LeadsPage() {
  const [board] = useLeadBoard()

  return board === 'induction' ? <InductionLeadsBoard /> : <FoundationLeadsBoard />
}

// Everything that was previously the whole page: the stat cards, filters and
// lead table, all reading Lead records that arrive through the Foundation
// form. Moved behind a tab with no changes to what it renders.
function FoundationLeadsBoard() {
  const { user } = useAuth()

  // Section Admins are permanently locked to their own section - the role
  // itself carries this, not a UI selection, so it can never be navigated
  // away from. Admin/Super Admin have no scoped_section and keep the same
  // unrestricted board regardless of which tab they click.
  const scopedSection = user?.scoped_section || null

  const [viewingLead, setViewingLead] = useState(null)
  // ?lead=<id> opens that candidate straight away - how a due-date reminder in
  // the notification panel gets you to the person it's about. Fetched by id
  // rather than looked up in `items`, because the lead being chased is very
  // often not on the page of results you happen to be showing.
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkedLeadId = searchParams.get('lead')

  const deepLinkedQuery = useQuery({
    queryKey: ['lead', deepLinkedLeadId],
    queryFn: () => leadService.get(deepLinkedLeadId),
    enabled: Boolean(deepLinkedLeadId),
  })

  // Dropping the param on close stops the modal reopening itself on every
  // later render, and keeps the URL honest about what's on screen.
  function closeLead() {
    setViewingLead(null)
    if (deepLinkedLeadId) {
      const next = new URLSearchParams(searchParams)
      next.delete('lead')
      setSearchParams(next, { replace: true })
    }
  }

  // The row click still wins: if you opened someone else while a deep link was
  // in the URL, you get who you clicked.
  const openLead = viewingLead ?? (deepLinkedLeadId ? deepLinkedQuery.data : null)
  // Inline cell edits have no form to hang an error on, so failures surface
  // here instead of the cell silently reverting as if nothing happened.
  const [editError, setEditError] = useState(null)
  const [sectionFilter, setSectionFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // A Section Admin's section always wins over (and preempts) any tab
  // selection - for Admin/Super Admin this is just whichever tab is active.
  const effectiveSectionFilter = scopedSection || sectionFilter

  // Scoped to the user's own section for a Section Admin (so this becomes
  // that section's stage breakdown), but NOT to whichever tab an Admin/Super
  // Admin happens to have selected - their stat row always shows every
  // section's true count, tab selection only filters the table beneath it.
  // The backend clears by_section whenever a section is passed in, so
  // passing the tab selection here would zero out the other cards.
  const statsQuery = useQuery({
    queryKey: ['leads-stats', scopedSection],
    queryFn: () => leadService.getStats(scopedSection || undefined),
  })
  const total = statsQuery.data?.total ?? 0
  const bySection = statsQuery.data?.by_section ?? {}
  const byStatus = statsQuery.data?.by_status ?? {}

  // Sections are admin-managed and open-ended (see Form Collection's "Add
  // Form"), so the top stat cards and Section badge read live from config
  // rather than a fixed list.
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sectionOptions = configQuery.data?.sections ?? []
  const sectionByCode = Object.fromEntries(sectionOptions.map((section) => [section.code, section]))

  const courseOptionsQuery = useQuery({ queryKey: ['lead-course-options'], queryFn: leadService.getCourseOptions })
  // Everything the Course cell can offer, which is more than the filter's
  // list: a course nobody is on yet is a dead end to filter by and the point
  // of being able to set one.
  const courseCatalogQuery = useQuery({ queryKey: ['lead-course-catalog'], queryFn: leadService.getCourseCatalog })
  // Junk values from test leads created outside the real Foundation Form
  // programs - not real courses, so they don't belong in the filter list.
  const courseOptions = (courseOptionsQuery.data ?? []).filter(
    (course) => !EXCLUDED_COURSE_OPTIONS.includes(course),
  )

  // `total` above is the stat cards' unfiltered count across the whole board;
  // this one is how many rows the current filters actually matched, which is
  // what the table footer should report.
  const {
    items, page, setPage, search, setSearch, isLoading, error, totalPages,
    total: filteredTotal,
    pageSize,
  } = usePaginatedQuery('leads', leadService, {
    section: effectiveSectionFilter || undefined,
    course_interest: courseFilter || undefined,
    status: statusFilter || undefined,
    sort_order: sortOrder,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  })

  function selectSection(code) {
    setSectionFilter(code)
    setPage(1)
  }

  function handleDateChange({ dateFrom: nextFrom, dateTo: nextTo }) {
    setDateFrom(nextFrom)
    setDateTo(nextTo)
    setPage(1)
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <LeadAvatar name={row.name} />
          <span className="font-medium text-slate-900">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      align: 'center',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-900">{row.phone}</p>
          {row.email && <p className="text-xs text-slate-500">{row.email}</p>}
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      align: 'center',
      render: (row) => (
        <LeadCourseCell
          key={row.id}
          lead={row}
          options={courseCatalogQuery.data ?? []}
          onError={setEditError}
        />
      ),
    },
    // Redundant once a section is already active (every visible row is that
    // section by definition) - only shown in the unscoped "All Sections"
    // view, and never for a Section Admin.
    ...(effectiveSectionFilter
      ? []
      : [
          {
            key: 'section',
            header: 'Section',
            align: 'center',
            render: (row) => (row.section ? <Badge tone="blue">{sectionByCode[row.section]?.label ?? row.section}</Badge> : '—'),
          },
        ]),
    { key: 'date', header: 'Date', align: 'center', render: (row) => formatDate(row.created_at) },
    // Read-only on purpose: changing a plan rebuilds its installments from
    // the pricing table (LeadService.assign_plan), which would discard any
    // amounts, proofs and dates already collected against the old one. The
    // Lead Detail modal owns assigning/changing it, where that's explicit.
    {
      key: 'payment_plan',
      header: 'Payment Method',
      align: 'center',
      render: (row) =>
        row.payment_plan ? (
          <Badge tone={PAYMENT_PLAN_TONES[row.payment_plan] ?? 'slate'}>
            {PAYMENT_PLAN_LABELS[row.payment_plan] ?? titleCase(row.payment_plan)}
          </Badge>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        ),
    },
    {
      key: 'payment_call_remarks',
      header: 'Payment Remarks',
      align: 'center',
      render: (row) => (
        <SelectBadgeCell
          key={row.id}
          lead={row}
          field="payment_call_remarks"
          options={CALL_REMARK_OPTIONS}
          displayByValue={CALL_REMARK_BY_VALUE}
          placeholder="Select…"
          onError={setEditError}
        />
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      align: 'center',
      render: (row) => {
        const stage = LEAD_STAGE_BY_VALUE[row.status]
        const style = STAGE_CELL_STYLES[row.status] ?? 'border-transparent bg-slate-600 text-white'
        return (
          <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-medium ${style}`}>
            {stage?.label ?? titleCase(row.status)}
          </span>
        )
      },
    },
    { key: 'query', header: 'Query', align: 'center', render: (row) => <TruncatedText text={row.notes} /> },
    {
      key: 'remarks',
      header: 'Remarks',
      align: 'center',
      render: (row) => <RemarksCell key={row.id} lead={row} onError={setEditError} />,
    },
  ]

  return (
    <div>
      {scopedSection ? (
        <LeadSectionStageStats
          total={total}
          stages={LEAD_STAGES}
          byStatus={byStatus}
          activeStage={statusFilter}
          onSelect={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        />
      ) : (
        <LeadSectionStats
          total={total}
          sections={sectionOptions}
          bySection={bySection}
          activeSection={sectionFilter}
          onSelect={selectSection}
        />
      )}

      {/* One toolbar card, matching the Induction board: search and the filters
          are the same job, so they sit on one surface instead of floating
          loose above the table. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-55 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Search by name, course…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>

          {/* Separates "find by text" from "narrow by value". */}
          <span className="hidden h-7 w-px shrink-0 bg-slate-200 lg:block" />

          <FilterDropdown
            label="Course"
            value={courseFilter}
            options={courseOptions.map((course) => ({ value: course, label: course }))}
            onChange={(value) => {
              setCourseFilter(value)
              setPage(1)
            }}
          />

          {/* No Section filter here: the stat cards above already are the
              section switcher, and two controls driving one piece of state
              just invited them to disagree on screen. */}
          <FilterDropdown
            label="Stage"
            value={statusFilter}
            options={LEAD_STAGES.map((stage) => ({ value: stage.value, label: stage.label }))}
            onChange={(value) => {
              setStatusFilter(value)
              setPage(1)
            }}
          />

          <SortOrderSelect
            value={sortOrder}
            onChange={(nextOrder) => {
              setSortOrder(nextOrder)
              setPage(1)
            }}
          />

          {/* No Create Lead here: leads arrive through the Form Collection
              forms, not by being typed into the board. */}
          <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />
        </div>
      </div>

      <TableCard>
        {/* Clicking anywhere on a row opens that lead, so there's no separate
            View column. Safe because every inline editor in the row (the
            payment-remarks select, the remarks popover) calls stopPropagation
            on each click path it owns - including its portal backdrop, which
            bubbles through React's component tree rather than the DOM and
            would otherwise open this modal while dismissing itself. Keep that
            up in anything interactive added to a row later. */}
        <DataTable
          columns={columns}
          rows={items}
          isLoading={isLoading}
          error={error}
          onRowClick={(row) => setViewingLead(row)}
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={filteredTotal}
          pageSize={pageSize}
        />
      </TableCard>

      {openLead && <LeadDetailModal lead={openLead} onClose={closeLead} />}

      <Toast message={editError} onDismiss={() => setEditError(null)} />
    </div>
  )
}
