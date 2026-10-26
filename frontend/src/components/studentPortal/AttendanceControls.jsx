import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FIELD } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDateTime } from '@/utils/formatters'

const OPTIONS = [
  { value: true, label: 'Present', active: 'bg-emerald-600 text-white' },
  { value: false, label: 'Absent', active: 'bg-red-600 text-white' },
  // Hands the answer back to Meet and Drive. Only offered once somebody has
  // answered, since until then "Auto" is simply what is already happening.
  { value: null, label: 'Auto', active: 'bg-slate-600 text-white' },
]

/**
 * A member of staff's answer for one student at one class. It wins over what
 * Meet and Drive say, and no sync overwrites it - "Auto" is how it is taken
 * back.
 */
export function AttendanceControl({ sessionId, studentId, override, disabled, onChanged }) {
  const mutation = useMutation({
    mutationFn: (attended) => studentPortalService.setAttendance(sessionId, studentId, attended),
    onSuccess: onChanged,
  })
  const options = override === null || override === undefined ? OPTIONS.slice(0, 2) : OPTIONS

  return (
    <div className="inline-flex rounded-md bg-slate-100 p-0.5" role="group" aria-label="Mark attendance">
      {options.map((option) => {
        const isActive = override === option.value
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled || mutation.isPending}
            onClick={() => mutation.mutate(option.value)}
            aria-pressed={isActive}
            className={`h-7 rounded px-2 text-xs font-medium transition-colors disabled:opacity-50 ${
              isActive ? option.active : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * What a student said when they were rung about missing a class, oldest
 * first, and the box to add today's answer. A history, because a second call
 * a week later is a second answer and the first one still matters.
 */
export function RemarkThread({ sessionId, studentId, remarks, canAdd, onAdded }) {
  const [remark, setRemark] = useState('')
  const mutation = useMutation({
    mutationFn: () => studentPortalService.addCallRemark(sessionId, studentId, remark.trim()),
    onSuccess: () => {
      setRemark('')
      onAdded()
    },
  })

  return (
    <div className="space-y-2">
      {remarks.length > 0 ? (
        <ol className="space-y-1.5">
          {remarks.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
              <p className="whitespace-pre-wrap text-slate-800">{entry.remark}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {entry.by_name ?? 'Someone'} · {formatDateTime(entry.at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-slate-400">No call logged yet.</p>
      )}
      {canAdd && (
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (remark.trim()) mutation.mutate()
          }}
        >
          <textarea
            rows={1}
            maxLength={1000}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="What did they say? e.g. Unwell, will watch the recording"
            className={`${FIELD} min-h-9 flex-1 resize-y py-1.5 text-xs`}
          />
          <Button type="submit" variant="secondary" disabled={!remark.trim() || mutation.isPending}>
            <MessageSquarePlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Log call
          </Button>
        </form>
      )}
      <ErrorMessage message={mutation.error && getApiErrorMessage(mutation.error)} />
    </div>
  )
}
