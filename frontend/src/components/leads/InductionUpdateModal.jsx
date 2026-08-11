import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, GraduationCap, Briefcase, MessageSquare, ClipboardList, ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { getApiErrorMessage } from '@/services/apiClient'
import { MEDIA_BASE_URL } from '@/constants/config'

const STEPS = [
  { key: 'qualification', label: 'Qualification', icon: GraduationCap },
  { key: 'placement', label: 'Placement', icon: Briefcase },
  { key: 'remarks', label: 'Remarks', icon: MessageSquare },
  { key: 'other_details', label: 'Other Details', icon: ClipboardList },
]

// A percentage rather than High/Medium/Low: "medium" means something different
// to every caller, where 50% is the same number to all of them and can be
// averaged across a batch.
const CONFIDENCE_OPTIONS = ['0%', '25%', '50%', '75%', '100%']

function StepRail({ current }) {
  return (
    <div className="mb-5 flex items-center gap-1">
      {STEPS.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <div key={step.key} className="flex flex-1 items-center gap-1">
            <div
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:justify-start sm:px-2.5 ${
                active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : done
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-slate-50 text-slate-400'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  active ? 'bg-white/20' : done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : index + 1}
              </span>
              {/* Four labels across a phone truncate to "Qua…", "Pla…" and
                  say nothing. Only the step you're on keeps its name there;
                  the rest are numbered pills, which is enough to show how far
                  through you are. */}
              <span className={`truncate ${active ? '' : 'hidden sm:inline'}`}>{step.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// One <select> for the yes/no answers. A checkbox can't tell "no" apart from
// "not asked yet", which matters on a form filled in over the course of a call.
function YesNoSelect({ label, value, onChange }) {
  return (
    <Select
      label={label}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value === 'true')}
    >
      <option value="">Not recorded</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </Select>
  )
}

export function InductionUpdateModal({ entry, onClose }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)

  // Seeded from what's already saved, so reopening the form shows previous
  // answers rather than a blank slate.
  const [form, setForm] = useState({
    qualification: { ...entry.qualification },
    placement: { ...entry.placement },
    remarks: { ...entry.remarks },
    other_details: { ...entry.other_details },
  })

  const set = (group, key, value) =>
    setForm((current) => ({ ...current, [group]: { ...current[group], [key]: value } }))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['induction-entries'] })

  const saveMutation = useMutation({
    mutationFn: () => inductionEntryService.updateDetails(entry.id, form),
    onSuccess: () => {
      invalidate()
      onClose()
    },
  })

  const isLast = step === STEPS.length - 1
  const error = saveMutation.error

  const confidence = form.other_details.confidence
  const legacyConfidence = confidence && !CONFIDENCE_OPTIONS.includes(confidence) ? confidence : null

  // Recordings uploaded before this became a Drive link are stored as a server
  // path, so they still open through the media host. Anything absolute is a
  // link someone pasted and is used as given.
  const storedRecording = form.other_details.call_recording_url
  const recordingHref = !storedRecording
    ? null
    : /^https?:\/\//i.test(storedRecording)
      ? storedRecording
      : `${MEDIA_BASE_URL}${storedRecording}`

  return (
    <Modal title={`Update — ${entry.name}`} isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="-mt-1">
        <StepRail current={step} />
        <ErrorMessage message={error ? getApiErrorMessage(error) : null} />

        {step === 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="UG Degree"
              value={form.qualification.ug_degree ?? ''}
              onChange={(e) => set('qualification', 'ug_degree', e.target.value)}
            />
            <Input
              label="UG Passed Out Year"
              value={form.qualification.ug_passed_out_year ?? ''}
              onChange={(e) => set('qualification', 'ug_passed_out_year', e.target.value)}
            />
            <Input
              label="PG Degree"
              value={form.qualification.pg_degree ?? ''}
              onChange={(e) => set('qualification', 'pg_degree', e.target.value)}
            />
            <Input
              label="PG Passed Out Year"
              value={form.qualification.pg_passed_out_year ?? ''}
              onChange={(e) => set('qualification', 'pg_passed_out_year', e.target.value)}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Textarea
              label="Work Experience"
              rows={3}
              value={form.placement.work_experience ?? ''}
              onChange={(e) => set('placement', 'work_experience', e.target.value)}
            />
            <Textarea
              label="Training (or) Extra Course Done"
              rows={2}
              value={form.placement.training_or_extra_course ?? ''}
              onChange={(e) => set('placement', 'training_or_extra_course', e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Current Location (Native / Staying)"
                value={form.placement.current_location ?? ''}
                onChange={(e) => set('placement', 'current_location', e.target.value)}
              />
              <Input
                label="Preferred Location for Placement"
                value={form.placement.preferred_location ?? ''}
                onChange={(e) => set('placement', 'preferred_location', e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Select
              label="Live Session (or) Recorded Session"
              value={form.remarks.session_preference ?? ''}
              onChange={(e) => set('remarks', 'session_preference', e.target.value || null)}
            >
              <option value="">Not recorded</option>
              <option value="Live">Live Session</option>
              <option value="Recorded">Recorded Session</option>
            </Select>
            <Textarea
              label="Requirements"
              rows={3}
              value={form.remarks.requirements ?? ''}
              onChange={(e) => set('remarks', 'requirements', e.target.value)}
            />
            <Textarea
              label="Details"
              rows={3}
              value={form.remarks.details ?? ''}
              onChange={(e) => set('remarks', 'details', e.target.value)}
            />
            <Textarea
              label="Doubts Clarified"
              rows={3}
              value={form.remarks.doubts_clarified ?? ''}
              onChange={(e) => set('remarks', 'doubts_clarified', e.target.value)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                type="date"
                label="Induction Call Date"
                value={form.other_details.induction_call_date?.slice(0, 10) ?? ''}
                onChange={(e) => set('other_details', 'induction_call_date', e.target.value || null)}
              />
              <Input
                type="time"
                label="Scheduled Time"
                value={form.other_details.scheduled_time ?? ''}
                onChange={(e) => set('other_details', 'scheduled_time', e.target.value)}
              />
              <YesNoSelect
                label="Terms & Condition Form Signed"
                value={form.other_details.terms_form_signed}
                onChange={(value) => set('other_details', 'terms_form_signed', value)}
              />
              <YesNoSelect
                label="WhatsApp Group Added"
                value={form.other_details.whatsapp_group_added}
                onChange={(value) => set('other_details', 'whatsapp_group_added', value)}
              />
            </div>

            <Select
              label="Confident About the Candidate"
              value={form.other_details.confidence ?? ''}
              onChange={(e) => set('other_details', 'confidence', e.target.value || null)}
            >
              <option value="">Not recorded</option>
              {CONFIDENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {/* Entries answered before this became a percentage still hold
                  High/Medium/Low. Without carrying the stored value the select
                  would render blank and quietly rewrite it to null on save. */}
              {legacyConfidence && <option value={legacyConfidence}>{legacyConfidence} (previously recorded)</option>}
            </Select>

            <div>
              <Input
                type="url"
                label="Induction Call Screen Recording"
                placeholder="https://drive.google.com/..."
                value={form.other_details.call_recording_url ?? ''}
                onChange={(e) => set('other_details', 'call_recording_url', e.target.value || null)}
              />
              <p className="mt-1 text-xs text-slate-500">
                Paste the Drive link to the recording. Make sure anyone with the link can view it.
              </p>
              {recordingHref && (
                <a
                  href={recordingHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Open recording
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {/* Save is available on every step, not just the last: the call
                may end before all four pages are filled, and what's typed so
                far is worth keeping. */}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            {!isLast && <Button onClick={() => setStep((s) => s + 1)}>Next</Button>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
