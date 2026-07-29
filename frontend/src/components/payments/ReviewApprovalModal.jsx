import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

export function ReviewApprovalModal({ lead, onClose }) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canAct = hasPermission(PERMISSIONS.LEADS_UPDATE)

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
    <PaymentDetailModal
      lead={lead}
      title="Review Income"
      statusBadge={<Badge tone="amber">● Awaiting Approval</Badge>}
      onClose={onClose}
      error={mutation.error ? getApiErrorMessage(mutation.error) : null}
      footer={
        <>
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
        </>
      }
    />
  )
}
