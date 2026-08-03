import { CalendarDays, GraduationCap, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/utils/formatters'
import { ReadinessChecklist } from '@/components/hr/ReadinessChecklist'

const STATUS_TONE = { upcoming: 'amber', confirmed: 'green', ongoing: 'blue' }

export function BatchReadinessCard({ batch, isSelected, onSelect, onConfirm, canConfirm, isConfirming }) {
  const isFull = batch.seats_remaining === 0
  const isConfirmed = batch.status === 'confirmed'

  return (
    <div
      className={`rounded-lg border bg-white p-4 shadow-sm transition-colors ${
        isSelected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{batch.batch_name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {batch.course_name ?? 'Unknown course'}
            </p>
          </div>
          <Badge tone={STATUS_TONE[batch.status] ?? 'slate'}>{batch.status}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {formatDate(batch.start_date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {batch.allocated_count} / {batch.capacity} allocated
          </span>
          <span>{batch.tutor_name ?? 'No tutor'}</span>
        </div>

        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${isFull ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(batch.fill_percent, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {batch.paid_count} of {batch.allocated_count} fees cleared
            {batch.seats_remaining > 0 && ` · ${batch.seats_remaining} seats free`}
          </p>
        </div>
      </button>

      {isSelected && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <ReadinessChecklist checks={batch.checks} />
          {!isConfirmed && canConfirm && (
            <Button
              variant={batch.can_confirm ? 'success' : 'secondary'}
              disabled={!batch.can_confirm || isConfirming}
              onClick={onConfirm}
              className="mt-3 w-full"
            >
              {isConfirming ? 'Confirming…' : batch.can_confirm ? 'Confirm Batch' : 'Not ready to confirm'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
