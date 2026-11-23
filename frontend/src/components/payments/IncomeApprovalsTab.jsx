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
import { formatCurrency, formatDate, formatDateTime, formatExactCurrency, titleCase } from '@/utils/formatters'
import {
  getAwaitingPayments,
  getInstallmentCollected,
  getInstallmentGst,
  getLeadPaymentSummary,
  getPaymentApproval,
  getPaymentLedger,
} from '@/utils/leadPayment'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'
import { ReviewApprovalModal } from '@/components/payments/ReviewApprovalModal'
import { TableCard } from '@/components/ui/TableCard'

// One page of the Approved Students tab. That list only grows, so unlike the
// awaiting list - which empties as Finance works through it - it pages.
const APPROVED_PAGE_SIZE = 25

const snoColumn = { key: 'sno', header: 'S.No', render: (row) => row.__rowNumber }
// The number under the name rather than in a column of its own: with GST added,
// the table ran past the card and took the Review button off the screen.
const leadColumn = {
  key: 'lead',
  header: 'Lead',
  render: (row) => (
    <div>
      <p className="font-medium text-slate-900">{row.name}</p>
      <p className="text-xs text-slate-500">{row.phone}</p>
    </div>
  ),
}
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
// Collected on top of the amount, with the two added up under it - the money
// that should be in the bank. Blank on payments from before GST.
const gstColumn = {
  key: 'gst',
  header: 'GST',
  render: (row) => {
    const { gstAmount, totalPaid } = getLeadPaymentSummary(row)
    if (!(gstAmount > 0)) return '—'
    return (
      <div className="whitespace-nowrap">
        {formatExactCurrency(gstAmount)}
        <p className="text-xs text-slate-500">Total {formatExactCurrency(totalPaid)}</p>
      </div>
    )
  },
}
// The accounts the money went into - what Finance checks the bank against.
// Every one the token and payments used, not just the latest: a student can
// pay the token into one QR code and the rest into another. Leads with no
// payment collection carry only the lead's own QR code.
function paidIntoQrCodes(lead) {
  const { token, payments } = getPaymentLedger(lead)
  const codes = [token, ...payments].filter(Boolean).map(({ entry }) => entry.qr_code).filter(Boolean)
  const unique = [...new Set(codes)]
  return unique.length ? unique : lead.qr_code ? [lead.qr_code] : []
}

function QrCodes({ codes }) {
  if (!codes.length) return '—'
  return (
    <div className="flex flex-col items-center gap-1">
      {codes.map((code) => (
        <Badge key={code} outline tone="violet">
          {code}
        </Badge>
      ))}
    </div>
  )
}

// In place of the payment mode, which was UPI on nearly every row and told
// Finance nothing it needed to check.
const qrCodeColumn = {
  key: 'qr_code',
  header: 'QR Code',
  align: 'center',
  render: (row) => <QrCodes codes={paidIntoQrCodes(row)} />,
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
// A student already in class who has paid again, rather than a first payment.
const isLaterPayment = (lead) => lead.status === 'batch_confirmation'

// What Finance is being asked about on the Awaiting tab: the new payments of a
// student paying again, or else everything the lead has paid.
function awaitingFigures(lead) {
  const payments = isLaterPayment(lead) ? getAwaitingPayments(lead) : []
  const { paidAmount, gstAmount } = getLeadPaymentSummary(lead)
  if (!payments.length) return { payments, amount: paidAmount, gst: gstAmount, paidAmount }
  return {
    payments,
    amount: payments.reduce((sum, entry) => sum + getInstallmentCollected(entry), 0),
    gst: payments.reduce((sum, entry) => sum + getInstallmentGst(entry), 0),
    paidAmount,
  }
}

// When the money came in for a student paying again - the day their lead was
// created is long past and says nothing about the payment.
const awaitingDateColumn = {
  key: 'date',
  header: 'Date',
  render: (row) => {
    const paidOn = isLaterPayment(row) ? getAwaitingPayments(row).at(-1)?.paid_at : null
    return formatDate(paidOn ?? row.created_at)
  },
}
// The amount to approve, not the running total: for a student paying again the
// rest of it has been approved already.
const awaitingAmountColumn = {
  ...amountColumn,
  render: (row) => {
    const { payments, amount, paidAmount } = awaitingFigures(row)
    if (amount === null) return '—'
    if (!isLaterPayment(row)) return formatCurrency(amount)
    return (
      <div className="whitespace-nowrap">
        {formatCurrency(amount)}
        <p className="text-xs text-slate-500">{payments.map((entry) => entry.label).join(', ')}</p>
        <p className="text-xs text-slate-500">{formatCurrency(paidAmount)} paid in all</p>
      </div>
    )
  },
}
const awaitingGstColumn = {
  ...gstColumn,
  render: (row) => {
    const { amount, gst } = awaitingFigures(row)
    if (!(gst > 0)) return '—'
    return (
      <div className="whitespace-nowrap">
        {formatExactCurrency(gst)}
        <p className="text-xs text-slate-500">Total {formatExactCurrency(amount + gst)}</p>
      </div>
    )
  },
}
const awaitingQrColumn = {
  ...qrCodeColumn,
  render: (row) => {
    const codes = [...new Set(getAwaitingPayments(row).map((entry) => entry.qr_code).filter(Boolean))]
    return <QrCodes codes={isLaterPayment(row) ? codes : paidIntoQrCodes(row)} />
  },
}
const awaitingStatusColumn = {
  key: 'status',
  header: 'Status',
  render: (row) => (
    <div className="space-y-1">
      <Badge tone="amber">● Awaiting Approval</Badge>
      {isLaterPayment(row) && <p className="text-xs text-slate-500">In Batch Confirmation</p>}
    </div>
  ),
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
  awaitingDateColumn,
  leadColumn,
  planColumn,
  awaitingAmountColumn,
  awaitingGstColumn,
  awaitingQrColumn,
  dueColumn,
  awaitingStatusColumn,
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
  planColumn,
  amountColumn,
  gstColumn,
  qrCodeColumn,
  dueColumn,
  {
    // Where the student is now. Approval moves them to Batch Confirmation,
    // but they can move on from there - or quit - and Finance should see that.
    key: 'stage',
    header: 'Stage',
    align: 'center',
    render: (row) => {
      const stage = LEAD_STAGE_BY_VALUE[row.status]
      // A payment Finance turned down, until it is corrected and comes back.
      const rejected = (row.installments ?? []).filter((entry) => getPaymentApproval(entry, row) === 'rejected')
      return (
        <div className="flex flex-col items-center gap-1">
          <Badge tone={stage?.tone ?? 'slate'}>{stage?.label ?? titleCase(row.status)}</Badge>
          {rejected.length > 0 && (
            <p className="text-xs font-medium text-red-600">
              {rejected.map((entry) => entry.label).join(', ')} rejected
            </p>
          )}
        </div>
      )
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
// students Finance has approved. A student paying in parts comes back to the
// first list with each payment, without leaving Batch Confirmation. Approving
// one moves it across - the backend
// records the approval (LeadService.approve_payment), and both lists are
// refetched under the shared 'income-approvals' key.
export function IncomeApprovalsTab() {
  const [view, setView] = useState('awaiting')
  const [approvedPage, setApprovedPage] = useState(1)
  const [openLead, setOpenLead] = useState(null)

  // Both always fetched, so each tab's count is there before it is opened.
  const awaitingQuery = useQuery({
    queryKey: ['income-approvals', 'awaiting'],
    queryFn: () => leadService.list({ awaiting_finance: true, page_size: 100 }),
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
            emptyMessage={view === 'awaiting' ? 'No payments awaiting approval.' : 'No students approved yet.'}
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
