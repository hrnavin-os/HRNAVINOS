import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TabStrip } from '@/components/ui/TabStrip'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import { TableCard } from '@/components/ui/TableCard'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { leadService } from '@/services/leadService'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { formatDate, formatDateTime } from '@/utils/formatters'

const dash = <span className="text-slate-400">—</span>

// Which tab of the Induction board the entry was on when it went. Mirrors
// InductionStatus on the backend, as the board's own cards do.
const INDUCTION_TAB = {
  pending_induction: { label: 'Induction Leads', tone: 'blue' },
  moved_to_foundation: { label: 'Moved to Foundation', tone: 'emerald' },
  quit: { label: 'Quit Students', tone: 'red' },
}

const TABS = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'induction', label: 'Induction' },
]

// `listDeleted` dressed as the `list` usePaginatedQuery calls.
const SERVICES = {
  foundation: { list: leadService.listDeleted },
  induction: { list: inductionEntryService.listDeleted },
}

const nameCell = (row) => (
  <div>
    <p className="font-medium text-slate-900">{row.name}</p>
    <p className="text-xs text-slate-500">{row.phone}</p>
  </div>
)

// Who, when and why - the three things the history exists to answer, so they
// are the same three columns on both tabs.
const deletionColumns = [
  { key: 'deleted_at', header: 'Deleted On', render: (row) => formatDateTime(row.deleted_at) },
  { key: 'deleted_by_name', header: 'Deleted By', render: (row) => row.deleted_by_name || dash },
  {
    key: 'deleted_reason',
    header: 'Reason',
    render: (row) => <p className="max-w-72 whitespace-pre-wrap break-words text-slate-700">{row.deleted_reason}</p>,
  },
]

/**
 * Every lead deleted from the Induction and Foundation boards, with who deleted
 * it, when and the reason they gave. Opens on the board it was opened from;
 * the tab switches to the other one, so either board leads to both lists.
 */
export function LeadDeletionHistoryModal({ initialBoard = 'foundation', onClose }) {
  const [board, setBoard] = useState(initialBoard)

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-5xl"
      header={
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">Deleted History</h2>
        </div>
      }
    >
      <div className="mb-3">
        <TabStrip tabs={TABS} value={board} onChange={setBoard} />
      </div>
      {/* Keyed by board so the search and page start over: page 3 of one
          board's deletions is not page 3 of the other's. */}
      <DeletedLeadsTable key={board} board={board} />
    </Modal>
  )
}

function DeletedLeadsTable({ board }) {
  const { items, total, page, pageSize, setPage, search, setSearch, isLoading, error, totalPages } =
    usePaginatedQuery(`deleted-${board}-leads`, SERVICES[board])

  // Section codes are admin-managed, so their labels come from the same config
  // the boards read rather than a list kept here.
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sectionLabel = (code) =>
    code ? (configQuery.data?.sections ?? []).find((section) => section.code === code)?.label ?? code : dash

  const columns =
    board === 'foundation'
      ? [
          { key: 'name', header: 'Name', render: nameCell },
          { key: 'section', header: 'Section', render: (row) => sectionLabel(row.section) },
          {
            key: 'status',
            header: 'Stage',
            render: (row) => {
              const stage = LEAD_STAGE_BY_VALUE[row.status]
              return stage ? <Badge tone={stage.tone}>{stage.label}</Badge> : dash
            },
          },
          ...deletionColumns,
        ]
      : [
          { key: 'name', header: 'Name', render: nameCell },
          { key: 'section', header: 'Section', render: (row) => sectionLabel(row.section) },
          {
            key: 'batch_number',
            header: 'Batch',
            render: (row) => (row.batch_number ? `Batch-${row.batch_number}` : dash),
          },
          {
            key: 'status',
            header: 'Was On',
            render: (row) => {
              const tab = INDUCTION_TAB[row.status]
              return tab ? <Badge tone={tab.tone}>{tab.label}</Badge> : dash
            },
          },
          { key: 'registration_date', header: 'Registered', render: (row) => formatDate(row.registration_date) },
          ...deletionColumns,
        ]

  return (
    <>
      <div className="relative mb-3 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          placeholder="Search by name or mobile…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>
      <TableCard>
        <DataTable columns={columns} rows={items} isLoading={isLoading} error={error} />
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
      </TableCard>
    </>
  )
}

/** The toolbar button that opens the history, for both boards. */
export function DeletedHistoryButton({ board, className = '' }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" className={className} onClick={() => setIsOpen(true)}>
        <History className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Deleted History
      </Button>
      {isOpen && <LeadDeletionHistoryModal initialBoard={board} onClose={() => setIsOpen(false)} />}
    </>
  )
}
