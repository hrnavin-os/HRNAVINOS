import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, CheckCircle2, CircleDollarSign, CreditCard, Hash, Phone, Wallet, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'
import { MEDIA_BASE_URL } from '@/constants/config'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

function buildInfoItems(lead, summary) {
  const items = [
    { icon: Phone, label: 'Contact', value: lead.phone },
    { icon: Calendar, label: 'Date', value: formatDate(lead.created_at) },
    { icon: Wallet, label: 'Paid Amount', value: summary.paidAmount !== null ? formatCurrency(summary.paidAmount) : '—' },
    { icon: CreditCard, label: 'Payment Mode', value: summary.mode ? titleCase(summary.mode) : '—' },
  ]
  if (summary.mode) {
    const isUpi = summary.mode === 'upi'
    items.push({
      icon: Hash,
      label: isUpi ? 'UPI ID' : 'Transaction ID',
      value: (isUpi ? summary.upiId : summary.transactionId) ?? '—',
    })
  }
  items.push({
    icon: CircleDollarSign,
    label: 'Due Amount',
    value: summary.hasPlan ? formatCurrency(summary.dueAmount) : '—',
  })
  return items
}

export function ReviewApprovalModal({ lead, onClose }) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canAct = hasPermission(PERMISSIONS.LEADS_UPDATE)
  const summary = getLeadPaymentSummary(lead)

  const mutation = useMutation({
    mutationFn: (status) => leadService.update(lead.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      onClose()
    },
  })

  return (
    <Modal title="Review Income" isOpen onClose={onClose} maxWidth="max-w-lg">
      <div className="-mt-2 space-y-4">
        <div className="flex items-center gap-3">
          <LeadAvatar name={lead.name} size="h-12 w-12" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{lead.name}</h2>
            <Badge tone="amber">● Awaiting Approval</Badge>
          </div>
        </div>

        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

        <div className="grid grid-cols-2 gap-2.5">
          {buildInfoItems(lead, summary).map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="truncate text-sm font-semibold text-slate-900">{item.value}</p>
              </div>
            </div>
          ))}
        </div>

        {lead.course_interest && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Course Interest — </span>
            {lead.course_interest}
          </p>
        )}

        {summary.proofUrl && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Payment Proof</p>
            <img
              src={`${MEDIA_BASE_URL}${summary.proofUrl}`}
              alt="Payment proof"
              className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canAct && (
            <>
              <Button variant="reject" onClick={() => mutation.mutate('pre_screening')} disabled={mutation.isPending}>
                <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Reject
              </Button>
              <Button variant="approve" onClick={() => mutation.mutate('batch_confirmation')} disabled={mutation.isPending}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Approve
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
