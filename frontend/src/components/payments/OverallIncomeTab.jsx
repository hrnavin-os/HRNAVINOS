import { useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getAfterPlacementFee, getLeadPaymentSummary } from '@/utils/leadPayment'
import { PAYMENT_PLAN_TONES } from '@/constants/paymentOptions'
import {
  INSTALLMENT_MODE_LABELS,
  INSTALLMENT_MODE_TONES,
  PAYMENT_PLAN_LABELS,
} from '@/constants/installmentPaymentModes'
import { IncomeDetailModal } from '@/components/payments/IncomeDetailModal'
import { TableCard } from '@/components/ui/TableCard'

const dash = <span className="text-slate-400">—</span>

const columns = [
  { key: 'sno', header: 'S.No', numeric: true, render: (row) => row.__rowNumber },
  { key: 'date', header: 'Date', render: (row) => formatDate(row.created_at) },
  { key: 'lead', header: 'Lead', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  { key: 'contact', header: 'Contact', numeric: true, render: (row) => row.phone },
  {
    // Which plan the student picked on the Form Collection payment step.
    // Older/manually-created leads carry no plan at all.
    key: 'payment_details',
    header: 'Payment Details',
    align: 'center',
    render: (row) =>
      row.payment_plan ? (
        <Badge tone={PAYMENT_PLAN_TONES[row.payment_plan] ?? 'slate'}>
          {PAYMENT_PLAN_LABELS[row.payment_plan] ?? titleCase(row.payment_plan)}
        </Badge>
      ) : (
        dash
      ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    numeric: true,
    render: (row) => {
      const { paidAmount } = getLeadPaymentSummary(row)
      return paidAmount !== null ? formatCurrency(paidAmount) : dash
    },
  },
  {
    key: 'mode',
    header: 'Mode',
    align: 'center',
    render: (row) => {
      const { mode } = getLeadPaymentSummary(row)
      if (!mode) return dash
      return <Badge tone={INSTALLMENT_MODE_TONES[mode] ?? 'slate'}>{INSTALLMENT_MODE_LABELS[mode] ?? titleCase(mode)}</Badge>
    },
  },
  {
    key: 'due',
    header: 'Due Amount',
    align: 'right',
    numeric: true,
    render: (row) => {
      const { hasPlan, dueAmount } = getLeadPaymentSummary(row)
      if (!hasPlan) return dash
      // A non-zero balance is the thing someone scanning this column is
      // looking for, so it gets weight; a settled zero stays quiet.
      return dueAmount > 0 ? <span className="font-medium text-amber-700">{formatCurrency(dueAmount)}</span> : formatCurrency(dueAmount)
    },
  },
  {
    // Owed only after the student is placed, so it's separate from Due Amount
    // (which is what's outstanding on the training fee right now).
    key: 'after_placement',
    header: 'After Placement',
    align: 'right',
    render: (row) => {
      const fee = getAfterPlacementFee(row)
      if (!fee) return dash
      // "NIL" is a real configured value for the top plan - show it as settled
      // rather than as an amount owed.
      return /^nil$/i.test(fee) ? (
        <span className="text-slate-400">Nil</span>
      ) : (
        <span className="font-medium text-slate-700 tabular-nums">{fee}</span>
      )
    },
  },
  {
    key: 'status',
    header: 'Status',
    align: 'center',
    render: () => <Badge tone="green">Approved</Badge>,
  },
]

export function OverallIncomeTab({ leads = [], isLoading, error }) {
  const [viewingLead, setViewingLead] = useState(null)
  const rows = leads.map((lead, index) => ({ ...lead, __rowNumber: index + 1 }))

  return (
    <>
      <TableCard>
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={isLoading}
          error={error}
          emptyMessage="No approved income entries match this filter."
          onRowClick={(row) => setViewingLead(row)}
        />
      </TableCard>
      {viewingLead && <IncomeDetailModal lead={viewingLead} onClose={() => setViewingLead(null)} />}
    </>
  )
}
