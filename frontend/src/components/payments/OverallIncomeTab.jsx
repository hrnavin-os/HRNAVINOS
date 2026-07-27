import { useQuery } from '@tanstack/react-query'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'

const columns = [
  { key: 'sno', header: 'S.No', render: (row) => row.__rowNumber },
  { key: 'date', header: 'Date', render: (row) => formatDate(row.created_at) },
  { key: 'lead', header: 'Lead', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { key: 'contact', header: 'Contact', render: (row) => row.phone },
  { key: 'batch', header: 'Batch', render: (row) => row.batch_preference ?? '—' },
  { key: 'amount', header: 'Amount', render: (row) => (row.paid_amount ? formatCurrency(row.paid_amount) : '—') },
  {
    key: 'mode',
    header: 'Mode',
    render: (row) => (row.payment_mode ? <Badge outline tone="emerald">{titleCase(row.payment_mode)}</Badge> : '—'),
  },
  {
    key: 'status',
    header: 'Status',
    render: () => <Badge tone="green">Approved</Badge>,
  },
]

export function OverallIncomeTab() {
  const query = useQuery({
    queryKey: ['overall-income'],
    queryFn: () => leadService.list({ status: 'batch_confirmation', page_size: 100 }),
  })

  const leads = (query.data?.items ?? []).map((lead, index) => ({ ...lead, __rowNumber: index + 1 }))

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <DataTable
        columns={columns}
        rows={leads}
        isLoading={query.isLoading}
        error={query.error ? getApiErrorMessage(query.error) : null}
        emptyMessage="No approved income entries yet."
      />
    </div>
  )
}
