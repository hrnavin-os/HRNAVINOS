import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate, formatExactCurrency } from '@/utils/formatters'
import { getAwaitingPayments, getInstallmentCollected, getInstallmentGst, getProofUrls } from '@/utils/leadPayment'

// The payments being decided on, for a student who is already in class. The
// popup's other figures are their running totals, approved money included.
function NewPaymentsPanel({ payments }) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-800">
        New payment{payments.length === 1 ? '' : 's'} to approve
      </p>
      {payments.map((entry) => {
        const amount = getInstallmentCollected(entry)
        const gst = getInstallmentGst(entry)
        return (
          <div key={entry.label} className="rounded-md border border-amber-100 bg-white px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {entry.label} · {formatExactCurrency(amount)}
              </p>
              {entry.paid_at && <p className="text-xs text-slate-500">{formatDate(entry.paid_at)}</p>}
            </div>
            <p className="text-xs text-slate-500">
              {[
                gst > 0 && `+ ${formatExactCurrency(gst)} GST = ${formatExactCurrency(amount + gst)}`,
                entry.qr_code,
                entry.transaction_id || entry.upi_id,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {entry.remarks && <p className="mt-0.5 break-words text-xs text-slate-500">{entry.remarks}</p>}
          </div>
        )
      })}
      <p className="text-xs text-amber-700">
        This student stays in Batch Confirmation and keeps attending class, whether you approve or reject.
      </p>
    </div>
  )
}

export function ReviewApprovalModal({ lead, onClose }) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canAct = hasPermission(PERMISSIONS.LEADS_UPDATE)
  // A student already in class who has paid again: the payment is what is
  // decided on, and their stage is left alone.
  const isLaterPayment = lead.status === 'batch_confirmation'
  const awaiting = getAwaitingPayments(lead)
  // Rejecting a first payment sends the lead back to Follow up call, and a move
  // back has to say why - the reason goes on the lead's timeline for whoever
  // picks it up. Rejecting a later one puts the reason on the payment.
  const [isRejecting, setIsRejecting] = useState(false)
  const [reason, setReason] = useState('')

  // Approving is its own call, not a status write: it records that Finance
  // approved, which is what puts the lead on the Approved Students tab.
  const mutation = useMutation({
    mutationFn: ({ approve, stageChangeReason }) =>
      approve
        ? leadService.financeApprove(lead.id)
        : isLaterPayment
          ? leadService.financeReject(lead.id, stageChangeReason)
          : leadService.update(lead.id, { status: 'pre_screening', stage_change_reason: stageChangeReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      onClose()
    },
  })

  return (
    <PaymentDetailModal
      lead={lead}
      title="Review Income"
      statusBadge={<Badge tone="amber">● Awaiting Approval</Badge>}
      onClose={onClose}
      error={mutation.error ? getApiErrorMessage(mutation.error) : null}
      notice={isLaterPayment && <NewPaymentsPanel payments={awaiting} />}
      proofs={isLaterPayment ? awaiting.flatMap(getProofUrls) : undefined}
      footer={
        isRejecting ? (
          <>
            <div className="min-w-0 flex-1">
              <Input
                autoFocus
                maxLength={500}
                placeholder="Why is this being rejected? e.g. Payment not credited yet"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setIsRejecting(false)
                setReason('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="reject"
              onClick={() => mutation.mutate({ approve: false, stageChangeReason: reason.trim() })}
              disabled={reason.trim().length < 3 || mutation.isPending}
            >
              <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {mutation.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canAct && (
              <>
                <Button variant="reject" onClick={() => setIsRejecting(true)} disabled={mutation.isPending}>
                  <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Reject
                </Button>
                <Button
                  variant="approve"
                  onClick={() => mutation.mutate({ approve: true })}
                  disabled={mutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Approve
                </Button>
              </>
            )}
          </>
        )
      }
    />
  )
}
