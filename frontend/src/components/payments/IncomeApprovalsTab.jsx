import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'
import { ReviewApprovalModal } from '@/components/payments/ReviewApprovalModal'

const columns = [
  { key: 'sno', header: 'S.No', render: (row) => row.__rowNumber },
  { key: 'date', header: 'Date', render: (row) => formatDate(row.created_at) },
  { key: 'lead', header: 'Lead', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { key: 'contact', header: 'Contact', render: (row) => row.phone },
  {
    key: 'amount',
    header: 'Amount',
    render: (row) => {
      const { paidAmount } = getLeadPaymentSummary(row)
      return paidAmount !== null ? formatCurrency(paidAmount) : '—'
    },
  },
  {
    key: 'mode',
    header: 'Mode',
    render: (row) => {
      const { mode } = getLeadPaymentSummary(row)
      return mode ? <Badge outline tone="emerald">{titleCase(mode)}</Badge> : '—'
    },
  },
  {
    key: 'due',
    header: 'Due Amount',
    render: (row) => {
      const { hasPlan, dueAmount } = getLeadPaymentSummary(row)
      return hasPlan ? formatCurrency(dueAmount) : '—'
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: () => <Badge tone="amber">● Awaiting Approval</Badge>,
  },
  {
    key: 'actions',
    header: '',
    render: (row) => (
      <Button variant="primary" className="!px-3 !py-1 text-xs" onClick={() => row.__onReview(row)}>
        Review
      </Button>
    ),
  },
]

export function IncomeApprovalsTab() {
  const [reviewingLead, setReviewingLead] = useState(null)
  const query = useQuery({
    queryKey: ['income-approvals'],
    queryFn: () => leadService.list({ status: 'financial_approval', page_size: 100 }),
  })

  if (query.isLoading) return <LoadingSpinner />
  if (query.error) return <ErrorMessage message={getApiErrorMessage(query.error)} />

  const leads = (query.data?.items ?? []).map((lead, index) => ({
    ...lead,
    __rowNumber: index + 1,
    __onReview: setReviewingLead,
  }))

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable columns={columns} rows={leads} emptyMessage="No leads awaiting financial approval." />
      </div>
      {reviewingLead && <ReviewApprovalModal lead={reviewingLead} onClose={() => setReviewingLead(null)} />}
    </>
  )
}
