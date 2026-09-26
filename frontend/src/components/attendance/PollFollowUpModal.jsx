import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { MessageSquareText, Phone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { attendanceBoardService } from '@/services/attendanceBoardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDateTime } from '@/utils/formatters'

/**
 * The section admin's follow-up on a student who hasn't selected the poll:
 * ring them, ask why, and write down what they said.
 *
 * Every earlier call is listed above the box, newest first, so whoever rings
 * next starts from what the student said last time rather than asking again.
 */
export function PollFollowUpModal({ student, onClose, onSaved }) {
  const [remark, setRemark] = useState('')
  const history = student.poll_follow_ups ?? []

  const save = useMutation({
    mutationFn: () => attendanceBoardService.addPollFollowUp(student.id, remark.trim()),
    onSuccess: () => {
      onSaved?.()
      onClose()
    },
  })

  return (
    <Modal title="Poll follow-up" isOpen onClose={onClose} maxWidth="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (remark.trim().length >= 2) save.mutate()
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
            <p className="truncate text-xs text-slate-500">
              {[student.section && `${student.section.toUpperCase()} Section`, student.batch].filter(Boolean).join(' · ') ||
                'Induction list'}
            </p>
          </div>
          {/* The number to ring, as a link so it dials from a phone. */}
          <a
            href={`tel:${student.phone}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-medium text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {student.phone}
          </a>
        </div>

        <ErrorMessage message={save.error ? getApiErrorMessage(save.error) : null} />

        <Textarea
          label="Why didn't they select the poll?"
          required
          rows={4}
          autoFocus
          placeholder="What the student said when you asked…"
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          maxLength={1000}
        />

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Earlier follow-ups ({history.length})
            </p>
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {history.map((item, index) => (
                <li key={`${item.at}-${index}`} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="flex items-start gap-1.5 text-sm text-slate-800">
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="whitespace-pre-wrap break-words">{item.remark}</span>
                  </p>
                  <p className="mt-1 pl-5 text-[11px] text-slate-400">
                    {formatDateTime(item.at)}
                    {item.by_name ? ` · ${item.by_name}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={remark.trim().length < 2 || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save remark'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
