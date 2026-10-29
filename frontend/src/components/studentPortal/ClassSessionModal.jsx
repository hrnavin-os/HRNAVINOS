import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { ConfirmDeleteModal } from '@/components/resource/ConfirmDeleteModal'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'

function initialValues(session, nextSequence) {
  if (!session) {
    return {
      sequence: String(nextSequence),
      title: '',
      held_on: new Date().toISOString().slice(0, 10),
      start_time: '',
      end_time: '',
      meeting: '',
      min_minutes: '10',
      recording_url: '',
    }
  }
  return {
    sequence: String(session.sequence),
    title: session.title,
    held_on: session.held_on,
    start_time: session.start_time ?? '',
    end_time: session.end_time ?? '',
    meeting: session.meet_url ?? '',
    min_minutes: String(session.min_minutes),
    recording_url: session.recording_url ?? '',
  }
}

/**
 * Add or edit one class of a batch.
 *
 * The Meet link is what live attendance is read by, and the Drive link is the
 * recording students are given once the class is over. Both can be added
 * later: a class is usually scheduled before its recording exists, and
 * pasting the recording in the next morning is the normal case.
 */
export function ClassSessionModal({ batchId, session, nextSequence, canManage, onClose, onSaved }) {
  const [values, setValues] = useState(() => initialValues(session, nextSequence))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  const save = useMutation({
    mutationFn: () => {
      // Empty strings go through for the two links - that is how a wrong
      // link is cleared - but the times are pattern-checked fields, where
      // "nothing" has to be null.
      const payload = {
        sequence: Number(values.sequence),
        title: values.title.trim(),
        held_on: values.held_on,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
        meeting: values.meeting.trim(),
        min_minutes: Number(values.min_minutes) || 0,
        recording_url: values.recording_url.trim(),
      }
      return session
        ? studentPortalService.updateSession(session.id, payload)
        : studentPortalService.createSession(batchId, payload)
    },
    onSuccess: () => onSaved({ removed: false }),
  })

  const remove = useMutation({
    mutationFn: () => studentPortalService.deleteSession(session.id),
    onSuccess: () => onSaved({ removed: true }),
  })

  if (confirmDelete) {
    return (
      <ConfirmDeleteModal
        title="Remove class"
        describe={`Class ${session.sequence} · ${session.title}`}
        consequence="Every student's attendance and absentee call remarks for this class go with it."
        error={remove.error && getApiErrorMessage(remove.error)}
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    )
  }

  return (
    <Modal title={session ? `Class ${session.sequence}` : 'Add a class'} isOpen onClose={onClose} maxWidth="max-w-xl">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <ErrorMessage message={save.error && getApiErrorMessage(save.error)} />
        <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
          <Input
            label="Class no."
            type="number"
            min={1}
            max={500}
            required
            value={values.sequence}
            onChange={set('sequence')}
            disabled={!canManage}
          />
          <Input
            label="Title"
            required
            maxLength={150}
            placeholder="e.g. Recruitment life cycle"
            value={values.title}
            onChange={set('title')}
            disabled={!canManage}
          />
        </div>
        {/* The times are what the register's start and end checks are taken
            against; without them the call's own first join and last leave
            stand in. */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Date" type="date" required value={values.held_on} onChange={set('held_on')} disabled={!canManage} />
          <Input label="Starts at" type="time" value={values.start_time} onChange={set('start_time')} disabled={!canManage} />
          <Input label="Ends at" type="time" value={values.end_time} onChange={set('end_time')} disabled={!canManage} />
          <Input
            label="Counts after (min)"
            type="number"
            min={0}
            max={600}
            title="Less time than this in the live call is recorded, but not counted as attended."
            value={values.min_minutes}
            onChange={set('min_minutes')}
            disabled={!canManage}
          />
        </div>
        <Input
          label="Google Meet link"
          placeholder="https://meet.google.com/abc-defg-hij"
          value={values.meeting}
          onChange={set('meeting')}
          disabled={!canManage}
        />
        <div>
          <Input
            label="Recording (Google Drive link)"
            placeholder="https://drive.google.com/file/d/…/view"
            value={values.recording_url}
            onChange={set('recording_url')}
            disabled={!canManage}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Meet saves the recording to the organiser&rsquo;s Drive. Paste its share link here and students who have
            signed the terms see it on their link. Views are read from the Drive audit log.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center justify-between gap-2 pt-2">
            {session ? (
              <Button type="button" variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : session ? 'Save' : 'Add class'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
