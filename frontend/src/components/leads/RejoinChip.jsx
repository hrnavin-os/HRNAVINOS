import { RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

// "Rejoin-30" straight after a student's name: they were here before, in
// Batch-30. Nothing at all for everybody else.
export function RejoinChip({ batch }) {
  if (!batch) return null
  return (
    <Badge tone="teal">
      <RotateCcw className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      Rejoin-{batch}
    </Badge>
  )
}
