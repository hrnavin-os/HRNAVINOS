import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, CalendarCheck, Hash, Layers, Mail, Phone } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { formatDate } from '@/utils/formatters'

const STATES = [
  { key: 'approved', label: 'Approved by Finance', tone: 'blue' },
  { key: 'group_assigned', label: 'Group Assigned', tone: 'green' },
  { key: 'lost', label: 'Lost', tone: 'red' },
]

const STATE_BUTTON_TONES = {
  blue: { active: 'border-blue-500 bg-blue-500 text-white', idle: 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50' },
  green: { active: 'border-green-600 bg-green-600 text-white', idle: 'border-green-300 bg-white text-green-700 hover:bg-green-50' },
  red: { active: 'border-red-600 bg-red-600 text-white', idle: 'border-red-300 bg-white text-red-700 hover:bg-red-50' },
}

// Which tab a student is sitting in - group assignment is a timestamp rather
// than a stage, so it has to be checked before the stage itself. Returns null
// for anything the HR tabs don't cover (e.g. a lead still at Financial
// Approval); callers already treat that as "no stage badge".
function hrStateOf(student) {
  if (student.status === 'lost') return 'lost'
  if (student.group_assigned_at) return 'group_assigned'
  if (student.status === 'batch_confirmation') return 'approved'
  return null
}

// Mirrors what the API will accept, so a move that can't succeed is disabled
// with the reason up front rather than failing after the click. The pipeline
// only runs forwards: Batch Confirmation can't be walked back (Lost aside),
// and Lost is an exit, not a parking spot.
function transitionTo(current, target) {
  if (current === target) return { kind: 'current' }
  if (current === 'lost') {
    return { blocked: 'A lost student can’t be moved back into the pipeline.' }
  }
  if (target === 'lost') return { kind: 'stage', status: 'lost' }
  if (target === 'approved') {
    if (current === 'group_assigned') return { kind: 'unassign' }
  }
  if (target === 'group_assigned') {
    if (current === 'approved') return { kind: 'assign' }
    return { blocked: 'Move the student to Approved by Finance first.' }
  }
  return { blocked: 'Not available from here.' }
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="break-words text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

export function HRStudentDetailModal({ student, sectionLabel, onClose }) {
  const queryClient = useQueryClient()
  const [pendingLost, setPendingLost] = useState(false)
  const [lostReason, setLostReason] = useState('')

  const current = hrStateOf(student)

  const mutation = useMutation({
    mutationFn: (move) => {
      if (move.kind === 'assign') return batchConfirmationService.markGroupAssigned(student.id, true)
      if (move.kind === 'unassign') return batchConfirmationService.markGroupAssigned(student.id, false)
      return batchConfirmationService.setHrStage(student.id, move.status, move.lostReason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-confirmation'] })
      onClose()
    },
  })

  function handleMove(target) {
    const move = transitionTo(current, target)
    if (move.blocked || move.kind === 'current') return
    // Lost needs a reason before anything is sent - the API rejects it
    // without one, and the Lost tab exists to explain why.
    if (move.status === 'lost') {
      setPendingLost(true)
      return
    }
    mutation.mutate(move)
  }

  const dash = <span className="text-slate-400">—</span>

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-2xl"
      header={
        <div className="flex min-w-0 items-center gap-3">
          <LeadAvatar name={student.name} size="h-11 w-11" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">{student.name}</h2>
              {current && (
                <Badge tone={STATES.find((s) => s.key === current)?.tone ?? 'slate'}>
                  {STATES.find((s) => s.key === current)?.label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500">{student.phone}</p>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <DetailRow icon={Phone} label="Phone" value={student.phone} />
          <DetailRow icon={Mail} label="Email" value={student.email ?? dash} />
          <DetailRow icon={BookOpen} label="Course" value={student.course_interest ?? dash} />
          <DetailRow icon={Layers} label="Section" value={sectionLabel ?? student.section?.toUpperCase() ?? dash} />
          {/* `batch` is derived from the student's induction registration
              month, falling back to a hand-typed batch_number for leads that
              never came through Induction. */}
          <DetailRow icon={Hash} label="Batch" value={student.batch ?? dash} />
          <DetailRow
            icon={CalendarCheck}
            label={student.group_assigned_at ? 'Group Assigned' : 'Added'}
            value={formatDate(student.group_assigned_at ?? student.created_at)}
          />
        </div>

        {student.status === 'lost' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Lost</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{student.lost_reason ?? 'No reason recorded'}</p>
            {student.lost_at && <p className="mt-0.5 text-xs text-red-700">{formatDate(student.lost_at)}</p>}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">Move student to</p>
          <div className="grid grid-cols-2 gap-2">
            {STATES.map((state) => {
              const move = transitionTo(current, state.key)
              const isCurrent = move.kind === 'current'
              const tones = STATE_BUTTON_TONES[state.tone]
              return (
                <button
                  key={state.key}
                  type="button"
                  onClick={() => handleMove(state.key)}
                  disabled={isCurrent || Boolean(move.blocked) || mutation.isPending}
                  title={move.blocked ?? (isCurrent ? 'Already here' : undefined)}
                  className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    isCurrent ? tones.active : tones.idle
                  }`}
                >
                  {state.label}
                  {isCurrent && <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>

        {pendingLost && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="mb-2 text-sm font-semibold text-red-700">Why is this student being marked Lost?</p>
            <Input
              autoFocus
              placeholder="e.g. Dropped out, unreachable, joined elsewhere…"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPendingLost(false)
                  setLostReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!lostReason.trim() || mutation.isPending}
                onClick={() => mutation.mutate({ kind: 'stage', status: 'lost', lostReason: lostReason.trim() })}
              >
                {mutation.isPending ? 'Saving…' : 'Mark Lost'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
