import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, ChevronDown, Eye, Plus, Search } from 'lucide-react'
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
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ResourceForm } from '@/components/resource/ResourceForm'
import { LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'

const createFields = [
  { name: 'name', label: 'Full Name', placeholder: 'Full Name', required: true },
  { name: 'phone', label: 'Mobile Number', placeholder: 'Mobile Number', required: true },
  { name: 'email', label: 'E-Mail ID', placeholder: 'E-Mail ID', type: 'email' },
  {
    name: 'course_interest',
    label: 'Program you are planning to join?',
    placeholder: 'Program you are planning to join?',
    required: true,
  },
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

// Shows just the first 6 characters + "…" so a long query doesn't blow out
// the row height; hovering reveals the full text in a small popup.
function TruncatedText({ text }) {
  if (!text) return <span className="text-slate-400">—</span>
  const trimmed = text.trim()
  if (trimmed.length <= 6) return <span>{trimmed}</span>

  return (
    <span className="group relative inline-block cursor-help border-b border-dotted border-slate-300">
      {trimmed.slice(0, 6)}…
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max max-w-xs rounded-md border border-slate-200 bg-white p-2 text-xs font-normal text-slate-700 shadow-lg group-hover:block">
        {trimmed}
      </span>
    </span>
  )
}

// Inline-editable "staff notes" cell - distinct from the read-only Query
// column (the student's own submitted text). Saves on blur/Enter, not on
// every keystroke.
function RemarksCell({ lead }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(lead.remarks ?? '')

  const mutation = useMutation({
    mutationFn: (remarks) => leadService.update(lead.id, { remarks }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  function commit() {
    if (value === (lead.remarks ?? '')) return
    mutation.mutate(value)
  }

  return (
    <input
      type="text"
      value={value}
      placeholder="Add remarks…"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="w-full min-w-35 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    />
  )
}

// A column header that's also its own filter dropdown - click the label to
// pick a value, "All <Label>s" clears it. Renders in place of a plain
// string `header`, since DataTable just puts whatever it's given into <th>.
function FilterableHeader({ label, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const isActive = Boolean(value)
  const selectedLabel = options.find((option) => option.value === value)?.label

  return (
    <div className="relative inline-block normal-case">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
          isActive ? 'text-brand-600' : 'text-slate-500'
        }`}
      >
        {isActive ? selectedLabel : label}
        <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 max-h-64 w-52 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setIsOpen(false)
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
                  setIsOpen(false)
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm font-normal ${
                  value === option.value ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'
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
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canCreate = hasPermission(PERMISSIONS.LEADS_CREATE)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewingLead, setViewingLead] = useState(null)
  const [viewingPayment, setViewingPayment] = useState(null)
  const [sectionFilter, setSectionFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const statsQuery = useQuery({ queryKey: ['leads-stats'], queryFn: leadService.getStats })
  const total = statsQuery.data?.total ?? 0
  const bySection = statsQuery.data?.by_section ?? {}

  // Sections are admin-managed and open-ended (see Form Collection's "Add
  // Form"), so the top stat cards and Section badge read live from config
  // rather than a fixed list.
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sectionOptions = configQuery.data?.sections ?? []
  const sectionByCode = Object.fromEntries(sectionOptions.map((section) => [section.code, section]))

  const courseOptionsQuery = useQuery({ queryKey: ['lead-course-options'], queryFn: leadService.getCourseOptions })
  const courseOptions = courseOptionsQuery.data ?? []

  const { items, page, setPage, search, setSearch, isLoading, error, totalPages } = usePaginatedQuery('leads', leadService, {
    section: sectionFilter || undefined,
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

  const viewingPaymentStage = viewingPayment ? LEAD_STAGE_BY_VALUE[viewingPayment.status] : null

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
    { key: 'phone', header: 'Ph.no', render: (row) => row.phone },
    { key: 'email', header: 'Email', render: (row) => row.email ?? '—' },
    {
      key: 'course',
      header: (
        <FilterableHeader
          label="Course"
          value={courseFilter}
          options={courseOptions.map((course) => ({ value: course, label: course }))}
          onChange={(value) => {
            setCourseFilter(value)
            setPage(1)
          }}
        />
      ),
      render: (row) => row.course_interest ?? '—',
    },
    {
      key: 'section',
      header: (
        <FilterableHeader
          label="Section"
          value={sectionFilter}
          options={sectionOptions.map((section) => ({ value: section.code, label: section.label }))}
          onChange={selectSection}
        />
      ),
      render: (row) => (row.section ? <Badge tone="blue">{sectionByCode[row.section]?.label ?? row.section}</Badge> : '—'),
    },
    {
      key: 'payment',
      header: 'Payment Details',
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setViewingPayment(row)
          }}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label={`View payment details for ${row.name}`}
        >
          <Eye className="h-4 w-4" strokeWidth={2} />
        </button>
      ),
    },
    {
      key: 'stage',
      header: (
        <FilterableHeader
          label="Stage"
          value={statusFilter}
          options={LEAD_STAGES.map((stage) => ({ value: stage.value, label: stage.label }))}
          onChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        />
      ),
      render: (row) => {
        const stage = LEAD_STAGE_BY_VALUE[row.status]
        return <Badge outline tone={stage?.tone ?? 'slate'}>{stage?.label ?? titleCase(row.status)}</Badge>
      },
    },
    { key: 'query', header: 'Query', render: (row) => <TruncatedText text={row.notes} /> },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (row) => <RemarksCell key={row.id} lead={row} />,
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
          <p className="mt-1 text-sm text-slate-500">Prospective students tracked through the admin pipeline.</p>
        </div>
      </div>

      <LeadSectionStats
        total={total}
        sections={sectionOptions}
        bySection={bySection}
        activeSection={sectionFilter}
        onSelect={selectSection}
      />

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

        <Select
          className="!w-auto"
          value={sortOrder}
          onChange={(event) => {
            setSortOrder(event.target.value)
            setPage(1)
          }}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </Select>

        <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={handleDateChange} />

        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Create Lead
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable columns={columns} rows={items} isLoading={isLoading} error={error} onRowClick={(row) => setViewingLead(row)} />
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {isCreateOpen && (
        <Modal title="New Lead" isOpen onClose={() => setIsCreateOpen(false)}>
          <ResourceForm
            fields={createFields}
            onSubmit={(values) => createMutation.mutateAsync(values)}
            onCancel={() => setIsCreateOpen(false)}
            submitError={createMutation.error ? getApiErrorMessage(createMutation.error) : null}
          />
        </Modal>
      )}

      {viewingLead && <LeadDetailModal lead={viewingLead} onClose={() => setViewingLead(null)} />}

      {viewingPayment && (
        <PaymentDetailModal
          lead={viewingPayment}
          title="Payment Details"
          statusBadge={
            <Badge outline tone={viewingPaymentStage?.tone ?? 'slate'}>
              {viewingPaymentStage?.label ?? titleCase(viewingPayment.status)}
            </Badge>
          }
          onClose={() => setViewingPayment(null)}
        />
      )}
    </div>
  )
}
