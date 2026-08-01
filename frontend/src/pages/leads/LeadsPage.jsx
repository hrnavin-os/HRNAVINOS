import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Eye, LayoutGrid, List as ListIcon, Plus, RefreshCw, Search } from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { leadService } from '@/services/leadService'
import { googleSheetsService } from '@/services/googleSheetsService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatLeadSource, LEAD_SOURCE_OPTIONS, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { PERMISSIONS } from '@/constants/permissions'
import { titleCase, formatDate } from '@/utils/formatters'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { ResourceForm } from '@/components/resource/ResourceForm'
import { LeadStageStats } from '@/components/leads/LeadStageStats'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'

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

function AssignToMeButton({ lead }) {
  const { user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => leadService.assign(lead.id, user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  if (!hasPermission(PERMISSIONS.LEADS_ASSIGN) || lead.assigned_to === user.id) return null

  return (
    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      Assign to me
    </Button>
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
  const [searchParams] = useSearchParams()

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [viewingLead, setViewingLead] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState(searchParams.get('section') || '')
  const [sortOrder, setSortOrder] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [view, setView] = useState('list')
  const [syncMessage, setSyncMessage] = useState('')

  const statsQuery = useQuery({ queryKey: ['leads-stats'], queryFn: leadService.getStats })
  const total = statsQuery.data?.total ?? 0
  const byStatus = statsQuery.data?.by_status ?? {}

  // Sections are admin-managed and open-ended (see Form Collection's "Add
  // Form"), so the filter dropdown and table badge read live from config
  // rather than a fixed list.
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sectionOptions = configQuery.data?.sections ?? []
  const sectionByCode = Object.fromEntries(sectionOptions.map((section) => [section.code, section]))

  const { items, page, setPage, search, setSearch, isLoading, error, totalPages } = usePaginatedQuery('leads', leadService, {
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    section: sectionFilter || undefined,
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

  function selectTab(value) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleDateChange({ dateFrom: nextFrom, dateTo: nextTo }) {
    setDateFrom(nextFrom)
    setDateTo(nextTo)
    setPage(1)
  }

  const syncMutation = useMutation({
    mutationFn: googleSheetsService.syncNow,
    onSuccess: (data) => {
      setSyncMessage(
        data.leads_created > 0
          ? `Sync complete — ${data.leads_created} new submission(s) waiting in Form Check.`
          : 'Sync complete — no new submissions.',
      )
      queryClient.invalidateQueries({ queryKey: ['leads-pending-review'] })
      setTimeout(() => setSyncMessage(''), 4000)
    },
    onError: (error) => setSyncMessage(getApiErrorMessage(error)),
  })

  const columns = [
    {
      key: 'lead',
      header: 'Lead',
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
      render: (row) => (
        <div>
          <p className="text-slate-900">{row.phone}</p>
          {row.email && <p className="text-xs text-slate-500">{row.email}</p>}
        </div>
      ),
    },
    { key: 'source', header: 'Source', render: (row) => <Badge tone="slate">{formatLeadSource(row.source)}</Badge> },
    {
      key: 'section',
      header: 'Section',
      render: (row) => (row.section ? <Badge tone="blue">{sectionByCode[row.section]?.label ?? row.section}</Badge> : '—'),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (row) => {
        const stage = LEAD_STAGE_BY_VALUE[row.status]
        return <Badge outline tone={stage?.tone ?? 'slate'}>{stage?.label ?? titleCase(row.status)}</Badge>
      },
    },
    { key: 'follow_up', header: 'Follow-up', render: (row) => formatDate(row.follow_up_at) },
    { key: 'created', header: 'Created', render: (row) => formatDate(row.created_at) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => setViewingLead(row)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`View ${row.name}`}
          >
            <Eye className="h-4 w-4" strokeWidth={2} />
          </button>
          <AssignToMeButton lead={row} />
        </div>
      ),
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

      <LeadStageStats total={total} byStatus={byStatus} activeStatus={statusFilter} onSelect={selectTab} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            className="pl-9"
            placeholder="Search leads by name, email, phone…"
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

        <Select
          className="!w-auto"
          value={sourceFilter}
          onChange={(event) => {
            setSourceFilter(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All Sources</option>
          {LEAD_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          className="!w-auto"
          value={sectionFilter}
          onChange={(event) => {
            setSectionFilter(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All Sections</option>
          {sectionOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>

        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Create Lead
          </Button>
        )}

        <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
          {syncMutation.isPending ? 'Syncing…' : 'Sync Sheets'}
        </Button>

        <div className="flex overflow-hidden rounded-md border border-slate-300">
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${
              view === 'kanban' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 border-l border-slate-300 px-3 py-2 text-sm font-medium ${
              view === 'list' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ListIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            List
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">{syncMessage}</div>
      )}

      {view === 'kanban' ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-500">
          Kanban view is coming soon. Switch to List to manage leads for now.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <DataTable columns={columns} rows={items} isLoading={isLoading} error={error} onRowClick={(row) => setViewingLead(row)} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

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
    </div>
  )
}
