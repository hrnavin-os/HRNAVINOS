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

export function ReviewApprovalModal({ lead, onClose }) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canAct = hasPermission(PERMISSIONS.LEADS_UPDATE)
  // Rejecting sends the lead back to Follow up call, and a move back has to
  // say why - the reason goes on the lead's timeline for whoever picks it up.
  const [isRejecting, setIsRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: ({ status, stageChangeReason }) =>
      leadService.update(lead.id, {
        status,
        ...(stageChangeReason ? { stage_change_reason: stageChangeReason } : {}),
      }),
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
              onClick={() => mutation.mutate({ status: 'pre_screening', stageChangeReason: reason.trim() })}
              disabled={!reason.trim() || mutation.isPending}
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
                  onClick={() => mutation.mutate({ status: 'batch_confirmation' })}
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
