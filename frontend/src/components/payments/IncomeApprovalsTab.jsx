import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { formatCurrency, formatDate, formatDateTime, titleCase } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'
import { ReviewApprovalModal } from '@/components/payments/ReviewApprovalModal'
import { TableCard } from '@/components/ui/TableCard'

// One page of the Approved Students tab. That list only grows, so unlike the
// awaiting list - which empties as Finance works through it - it pages.
const APPROVED_PAGE_SIZE = 25

const snoColumn = { key: 'sno', header: 'S.No', render: (row) => row.__rowNumber }
const leadColumn = { key: 'lead', header: 'Lead', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> }
const contactColumn = { key: 'contact', header: 'Contact', render: (row) => row.phone }
const planColumn = {
  // Which plan the student picked on the Form Collection payment step.
  // Older/manually-created leads carry no plan at all.
  key: 'payment_details',
  header: 'Payment Details',
  align: 'center',
  render: (row) =>
    row.payment_plan ? (
      <Badge outline tone="blue">
        {PAYMENT_PLAN_LABELS[row.payment_plan] ?? titleCase(row.payment_plan)}
      </Badge>
    ) : (
      '—'
    ),
}
const amountColumn = {
  key: 'amount',
  header: 'Amount',
  render: (row) => {
    const { paidAmount } = getLeadPaymentSummary(row)
    return paidAmount !== null ? formatCurrency(paidAmount) : '—'
  },
}
const modeColumn = {
  key: 'mode',
  header: 'Mode',
  align: 'center',
  render: (row) => {
    const { mode } = getLeadPaymentSummary(row)
    return mode ? <Badge outline tone="emerald">{titleCase(mode)}</Badge> : '—'
  },
}
const dueColumn = {
  key: 'due',
  header: 'Due Amount',
  render: (row) => {
    const { hasPlan, dueAmount, balanceDueAt } = getLeadPaymentSummary(row)
    if (!hasPlan) return '—'
    return (
      <div>
        {formatCurrency(dueAmount)}
        {dueAmount > 0 && balanceDueAt && <p className="text-xs text-slate-500">by {formatDate(balanceDueAt)}</p>}
      </div>
    )
  },
}
const actionColumn = (label, variant) => ({
  key: 'actions',
  header: '',
  render: (row) => (
    <Button variant={variant} className="px-3! py-1! text-xs" onClick={() => row.__onOpen(row)}>
      {label}
    </Button>
  ),
})

const AWAITING_COLUMNS = [
  snoColumn,
  { key: 'date', header: 'Date', render: (row) => formatDate(row.created_at) },
  leadColumn,
  contactColumn,
  planColumn,
  amountColumn,
  modeColumn,
  dueColumn,
  { key: 'status', header: 'Status', render: () => <Badge tone="amber">● Awaiting Approval</Badge> },
  actionColumn('Review', 'primary'),
]

const APPROVED_COLUMNS = [
  snoColumn,
  {
    // When Finance approved, and who - the record the tab exists to keep.
    key: 'approved_at',
    header: 'Approved On',
    render: (row) => (
      <div>
        <p>{formatDateTime(row.finance_approved_at)}</p>
        {row.finance_approved_by_name && <p className="text-xs text-slate-500">by {row.finance_approved_by_name}</p>}
      </div>
    ),
  },
  leadColumn,
  contactColumn,
  planColumn,
  amountColumn,
  dueColumn,
  {
    // Where the student is now. Approval moves them to Batch Confirmation,
    // but they can move on from there - or quit - and Finance should see that.
    key: 'stage',
    header: 'Stage',
    align: 'center',
    render: (row) => {
      const stage = LEAD_STAGE_BY_VALUE[row.status]
      return <Badge tone={stage?.tone ?? 'slate'}>{stage?.label ?? titleCase(row.status)}</Badge>
    },
  },
  actionColumn('View', 'secondary'),
]

// Which list is open is the whole point of the page, so the two tabs span it
// in big halves, each in its own accent - amber for what still needs Finance,
// green for what Finance has approved - rather than the small TabStrip pill.
const VIEW_TAB_STYLES = {
  awaiting: { icon: Clock, active: 'bg-amber-50 text-amber-700' },
  approved: { icon: CheckCircle2, active: 'bg-green-100 text-emerald-600' },
}

function ViewTabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-lg border border-slate-200">
      {tabs.map((tab, index) => {
        const { icon: Icon, active } = VIEW_TAB_STYLES[tab.key]
        const isActive = value === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors sm:text-base ${
              index > 0 ? 'border-l border-slate-200' : ''
            } ${isActive ? active : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// Finance's income approvals in two lists: leads waiting on Finance, and the
// students Finance has approved. Approving one moves it across - the backend
// records the approval (LeadService.approve_payment), and both lists are
// refetched under the shared 'income-approvals' key.
export function IncomeApprovalsTab() {
  const [view, setView] = useState('awaiting')
  const [approvedPage, setApprovedPage] = useState(1)
  const [openLead, setOpenLead] = useState(null)

  // Both always fetched, so each tab's count is there before it is opened.
  const awaitingQuery = useQuery({
    queryKey: ['income-approvals', 'awaiting'],
    queryFn: () => leadService.list({ status: 'financial_approval', page_size: 100 }),
  })
  const approvedQuery = useQuery({
    queryKey: ['income-approvals', 'approved', approvedPage],
    queryFn: () =>
      leadService.list({
        finance_approved: true,
        sort_by: 'finance_approved_at',
        sort_order: 'desc',
        page: approvedPage,
        page_size: APPROVED_PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  })

  const query = view === 'awaiting' ? awaitingQuery : approvedQuery
  const offset = view === 'approved' ? (approvedPage - 1) * APPROVED_PAGE_SIZE : 0
  const leads = (query.data?.items ?? []).map((lead, index) => ({
    ...lead,
    __rowNumber: offset + index + 1,
    __onOpen: setOpenLead,
  }))

  return (
    <>
      <ViewTabs
        tabs={[
          { key: 'awaiting', label: `Awaiting Approval (${awaitingQuery.data?.total ?? 0})` },
          { key: 'approved', label: `Approved Students (${approvedQuery.data?.total ?? 0})` },
        ]}
        value={view}
        onChange={(key) => {
          setView(key)
          setOpenLead(null)
        }}
      />

      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.error ? (
        <ErrorMessage message={getApiErrorMessage(query.error)} />
      ) : (
        <TableCard>
          <DataTable
            columns={view === 'awaiting' ? AWAITING_COLUMNS : APPROVED_COLUMNS}
            rows={leads}
            emptyMessage={view === 'awaiting' ? 'No leads awaiting financial approval.' : 'No students approved yet.'}
          />
          {view === 'approved' && (
            <Pagination
              page={approvedPage}
              totalPages={approvedQuery.data?.total_pages ?? 1}
              onPageChange={setApprovedPage}
              total={approvedQuery.data?.total}
              pageSize={APPROVED_PAGE_SIZE}
            />
          )}
        </TableCard>
      )}

      {openLead &&
        (view === 'awaiting' ? (
          <ReviewApprovalModal lead={openLead} onClose={() => setOpenLead(null)} />
        ) : (
          <PaymentDetailModal
            lead={openLead}
            title="Approved Student"
            statusBadge={<Badge tone="emerald">● Approved</Badge>}
            onClose={() => setOpenLead(null)}
            footer={
              <Button variant="secondary" onClick={() => setOpenLead(null)}>
                Close
              </Button>
            }
          />
        ))}
    </>
  )
}
