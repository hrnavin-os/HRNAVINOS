import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'
import { IncomeDetailModal } from '@/components/payments/IncomeDetailModal'

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
    render: () => <Badge tone="green">Approved</Badge>,
  },
]

export function OverallIncomeTab() {
  const [viewingLead, setViewingLead] = useState(null)
  const query = useQuery({
    queryKey: ['overall-income'],
    queryFn: () => leadService.list({ status: 'batch_confirmation', page_size: 100 }),
  })

  const leads = (query.data?.items ?? []).map((lead, index) => ({ ...lead, __rowNumber: index + 1 }))

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataTable
          columns={columns}
          rows={leads}
          isLoading={query.isLoading}
          error={query.error ? getApiErrorMessage(query.error) : null}
          emptyMessage="No approved income entries yet."
          onRowClick={(row) => setViewingLead(row)}
        />
      </div>
      {viewingLead && <IncomeDetailModal lead={viewingLead} onClose={() => setViewingLead(null)} />}
    </>
  )
}
