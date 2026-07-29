import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PaymentDetailModal } from '@/components/payments/PaymentDetailModal'

export function IncomeDetailModal({ lead, onClose }) {
  return (
    <PaymentDetailModal
      lead={lead}
      title="Income Details"
      statusBadge={<Badge tone="green">Approved</Badge>}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    />
  )
}
