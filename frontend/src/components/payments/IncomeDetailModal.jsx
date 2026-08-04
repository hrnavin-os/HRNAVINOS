import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'

export function IncomeDetailModal({ lead, onClose }) {
  const queryClient = useQueryClient()

  const markLostMutation = useMutation({
    mutationFn: () => leadService.markLost(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overall-income'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      onClose()
    },
  })

  return (
    <PaymentDetailModal
      lead={lead}
      title="Income Details"
      statusBadge={<Badge tone="green">Approved</Badge>}
      onClose={onClose}
      error={markLostMutation.error ? getApiErrorMessage(markLostMutation.error) : null}
      onMarkLost={() => markLostMutation.mutate()}
      isMarkingLost={markLostMutation.isPending}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    />
  )
}
