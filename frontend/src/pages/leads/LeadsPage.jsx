import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, ChevronDown, Eye, Pencil, Plus, Search } from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { PERMISSIONS } from '@/constants/permissions'
import { titleCase } from '@/utils/formatters'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Toast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ResourceForm } from '@/components/resource/ResourceForm'
import { LeadSectionStageStats, LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import { PAYMENT_OPTIONS, PAYMENT_OPTION_BY_VALUE, CALL_REMARK_OPTIONS, CALL_REMARK_BY_VALUE } from '@/constants/paymentOptions'

// Anchors a portaled popup under its trigger, clamped so it never runs off
// the right edge of the viewport (the table's own rightmost columns - View,
// Remarks - would otherwise push it past screen bounds).
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
const STAGE_CELL_STYLES = {
  new_lead: 'border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white',
  rnr: 'border-red-300 bg-red-100 text-red-700',
  pre_screening: 'border-yellow-300 bg-yellow-100 text-yellow-700',
  financial_approval: 'border-purple-300 bg-purple-100 text-purple-700',
  batch_confirmation: 'border-green-300 bg-green-100 text-green-700',
  lost: 'border-orange-300 bg-orange-100 text-orange-700',
}

// Matches Lead.remarks' server-side cap, so an over-long paste is stopped at
// the textarea instead of coming back as an opaque 422.
const REMARKS_MAX_LENGTH = 2000

// Section is required for anyone who can choose one: a lead created without
// it lands outside every A/B/C tab and is invisible to Section Admins, so it
// would silently never get worked. Section Admins don't get the field at all
// - the server pins new leads to their own section regardless of what's sent.
function buildCreateFields({ sectionOptions, isSectionScoped }) {
  return [
    { name: 'name', label: 'Full Name', placeholder: 'Full Name', required: true },
    { name: 'phone', label: 'Mobile Number', placeholder: 'Mobile Number', required: true },
    { name: 'email', label: 'E-Mail ID', placeholder: 'E-Mail ID', type: 'email' },
    {
      name: 'course_interest',
      label: 'Program you are planning to join?',
      placeholder: 'Program you are planning to join?',
      required: true,
    },
    ...(isSectionScoped
      ? []
      : [
          {
            name: 'section',
            label: 'Section',
            type: 'select',
            required: true,
            options: sectionOptions.map((section) => ({ value: section.code, label: section.label })),
          },
        ]),
    {
      name: 'batch_preference',
      label: 'Batch',
      placeholder: 'Batch',
    },
    {
      name: 'payment_expected',
      label: 'When will you make the payment?',
      placeholder: 'When will you make the payment?',
    },
    {
      name: 'notes',
      label: 'Any doubts or queries',
      placeholder: 'Any doubts or queries',
      type: 'textarea',
    },
  ]
}

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
        className="inline-block cursor-help border-b border-dotted border-slate-300"
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
// student's own submitted text). Shows as a pen icon (filled once a
// remark exists) rather than a persistent text box; clicking it opens a
// small popover to type into, submitted with the tick button.
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
        className={`rounded-md p-1.5 hover:bg-slate-100 ${lead.remarks ? 'text-brand-600' : 'text-slate-400'}`}
      >
        <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
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
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    mutation.mutate(option.value)
                    close()
                  }}
                  className="block w-full rounded px-1 py-1 text-left hover:bg-slate-50"
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

const SORT_OPTIONS = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc', label: 'Oldest first' },
]

// Sort filter for the lead table. A custom listbox rather than a native
// <select> because the browser draws the native option list itself - the
// milk-white/light-gray palette, the 5px radius and the Lexend face below
// would all be dropped on the open list (and the OS blue highlight kept).
function SortOrderSelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedLabel = SORT_OPTIONS.find((option) => option.value === value)?.label

  return (
    <div className="relative font-lexend">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-[150px] items-center justify-between gap-2 rounded-[5px] border border-[#DCDCD8]
          bg-[#FAFAF7] px-3 py-2 text-sm font-normal text-[#4A4A46] shadow-sm
          hover:bg-[#F2F2EE] focus:outline-none focus:ring-1 focus:ring-[#C9C9C4]"
      >
        {selectedLabel}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8C8C86] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 z-50 mt-1 w-[150px] overflow-hidden rounded-[5px]
              border border-[#DCDCD8] bg-[#FAFAF7] py-1 shadow-lg"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm font-normal text-[#4A4A46] ${
                  value === option.value ? 'bg-[#E8E8E3]' : 'hover:bg-[#F0F0EC]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// A filter-row button that opens a dropdown - click it to pick a value,
// "All <Label>s" clears it. Lives next to the search bar rather than in a
// column header. The menu is portaled to <body> (positioned from the
// button's own bounding rect) so it isn't clipped by DataTable's
// overflow-x-auto row container.
function FilterDropdown({ label, value, options, onChange }) {
  const buttonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const isActive = Boolean(value)
  const selectedLabel = options.find((option) => option.value === value)?.label

  function toggle() {
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPosition(popupPositionFor(rect, 260))
  }

  function close() {
    setMenuPosition(null)
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        {isActive ? selectedLabel : label}
        <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      </button>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, left: menuPosition.left }}
              className="fixed z-50 max-h-64 w-65 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  close()
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm font-normal ${
                  !value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                All {label}s
              </button>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    close()
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm font-normal ${
                    value === option.value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

function DateRangeFilter({ dateFrom, dateTo, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const hasValue = Boolean(dateFrom || dateTo)

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setIsOpen((open) => !open)}>
        <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {hasValue ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Date'}
      </Button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <Input type="date" label="From" value={dateFrom} onChange={(event) => onChange({ dateFrom: event.target.value, dateTo })} />
            <div className="mt-3">
              <Input type="date" label="To" value={dateTo} onChange={(event) => onChange({ dateFrom, dateTo: event.target.value })} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  onChange({ dateFrom: '', dateTo: '' })
                  setIsOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function LeadsPage() {
  const { hasPermission, user } = useAuth()
  const queryClient = useQueryClient()
  const canCreate = hasPermission(PERMISSIONS.LEADS_CREATE)

  // Section Admins are permanently locked to their own section - the role
  // itself carries this, not a UI selection, so it can never be navigated
  // away from. Admin/Super Admin have no scoped_section and keep the same
  // unrestricted board regardless of which tab they click.
  const scopedSection = user?.scoped_section || null

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewingLead, setViewingLead] = useState(null)
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
  // Junk values from test leads created outside the real Foundation Form
  // programs - not real courses, so they don't belong in the filter list.
  const courseOptions = (courseOptionsQuery.data ?? []).filter(
    (course) => !EXCLUDED_COURSE_OPTIONS.includes(course),
  )

  const { items, page, setPage, search, setSearch, isLoading, error, totalPages } = usePaginatedQuery('leads', leadService, {
    section: effectiveSectionFilter || undefined,
    course_interest: courseFilter || undefined,
    status: statusFilter || undefined,
    sort_order: sortOrder,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  })

  const createMutation = useMutation({
    mutationFn: (values) => leadService.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      setIsCreateOpen(false)
    },
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
    { key: 'course', header: 'Course', align: 'center', render: (row) => row.course_interest ?? '—' },
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
    {
      key: 'payment_option',
      header: 'Payment Option',
      align: 'center',
      render: (row) => (
        <SelectBadgeCell
          key={row.id}
          lead={row}
          field="payment_option"
          options={PAYMENT_OPTIONS}
          displayByValue={PAYMENT_OPTION_BY_VALUE}
          placeholder="Select…"
          onError={setEditError}
        />
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
        const style = STAGE_CELL_STYLES[row.status] ?? 'border-slate-300 bg-slate-100 text-slate-700'
        return (
          <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${style}`}>
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
    {
      key: 'view',
      header: 'View',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setViewingLead(row)
          }}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label={`View details for ${row.name}`}
        >
          <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {scopedSection ? `Admin ${scopedSection.toUpperCase()}-Section` : 'Admin'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Prospective students tracked through the admin pipeline.</p>
        </div>
      </div>

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
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

        <FilterDropdown
          label="Course"
          value={courseFilter}
          options={courseOptions.map((course) => ({ value: course, label: course }))}
          onChange={(value) => {
            setCourseFilter(value)
            setPage(1)
          }}
        />

        {!scopedSection && (
          <FilterDropdown
            label="Section"
            value={sectionFilter}
            options={sectionOptions.map((section) => ({ value: section.code, label: section.label }))}
            onChange={selectSection}
          />
        )}

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

        <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />

        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Create Lead
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* No onRowClick: the row carries inline editors (payment selects,
            remarks) whose dismiss-backdrops sit in portals, and a portal
            click still reaches the row through React's component tree. The
            View column's eye icon is the one deliberate way in. */}
        <DataTable columns={columns} rows={items} isLoading={isLoading} error={error} />
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {isCreateOpen && (
        <Modal title="New Lead" isOpen onClose={() => setIsCreateOpen(false)}>
          <ResourceForm
            fields={buildCreateFields({ sectionOptions, isSectionScoped: Boolean(scopedSection) })}
            onSubmit={(values) => createMutation.mutateAsync(values)}
            onCancel={() => setIsCreateOpen(false)}
            submitError={createMutation.error ? getApiErrorMessage(createMutation.error) : null}
          />
        </Modal>
      )}

      {viewingLead && <LeadDetailModal lead={viewingLead} onClose={() => setViewingLead(null)} />}

      <Toast message={editError} onDismiss={() => setEditError(null)} />
    </div>
  )
}
