import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Copy, FileSignature, Link2, MessageCircle, MessageSquare, RotateCcw, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AttendanceBadge, PercentBadge } from '@/components/studentPortal/AttendanceBadge'
import { AttendanceControl, RemarkThread } from '@/components/studentPortal/AttendanceControls'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { MEDIA_BASE_URL } from '@/constants/config'
import { formatDate, formatDateTime, titleCase } from '@/utils/formatters'

// wa.me wants digits only with a country code; a stored Indian number is the
// bare ten digits.
function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 10 ? `91${digits}` : digits
}

function Section({ title, icon: Icon, children, actions }) {
  return (
    <section className="rounded-md border border-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
          {title}
        </h3>
        {actions}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  )
}

function TermsSection({ student, canManage, onChanged }) {
  const [signedName, setSignedName] = useState(student.name)
  const [file, setFile] = useState(null)
  const [recording, setRecording] = useState(false)
  const record = useMutation({
    mutationFn: () => studentPortalService.recordTerms(student.id, { signedName, file }),
    onSuccess: () => {
      setRecording(false)
      onChanged()
    },
  })
  const clear = useMutation({ mutationFn: () => studentPortalService.clearTerms(student.id), onSuccess: onChanged })
  const terms = student.terms

  if (terms) {
    return (
      <Section
        title="Terms & Conditions"
        icon={FileSignature}
        actions={
          canManage && (
            <Button
              variant="ghost"
              className="h-7! px-2! text-xs text-red-600"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm('Withdraw this signature? Their link goes back to showing the terms.')) clear.mutate()
              }}
            >
              Withdraw
            </Button>
          )
        }
      >
        <div className="space-y-1 text-xs text-slate-600">
          <p>
            <Badge tone="green">Signed</Badge>
            <span className="ml-2 font-medium text-slate-900">{terms.signed_name}</span>
            <span className="ml-1.5">on {formatDateTime(terms.accepted_at)}</span>
          </p>
          <p>
            {terms.source === 'link'
              ? 'Signed by the student on their link'
              : `Recorded by ${terms.recorded_by_name ?? 'staff'} from a signature taken outside the portal`}
            {terms.ip && ` · from ${terms.ip}`}
          </p>
          <p>
            Agreed to &ldquo;{terms.document_title}&rdquo;
            {terms.document_updated_at && `, as last edited ${formatDate(terms.document_updated_at)}`}
          </p>
          {terms.signed_copy_url && (
            <a
              href={`${MEDIA_BASE_URL}${terms.signed_copy_url}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex font-medium text-brand-600 hover:text-brand-700"
            >
              View signed copy
            </a>
          )}
        </div>
        <ErrorMessage message={clear.error && getApiErrorMessage(clear.error)} />
      </Section>
    )
  }

  return (
    <Section title="Terms & Conditions" icon={FileSignature}>
      <p className="text-xs text-slate-600">
        <Badge tone="amber">Pending</Badge>
        <span className="ml-2">
          Nothing else on the student&rsquo;s link opens until they sign. Send them their link below.
        </span>
      </p>
      {canManage && !recording && (
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Signed on paper or WhatsApp? Record it here
        </button>
      )}
      {recording && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            record.mutate()
          }}
        >
          <Input
            label="Name as signed"
            required
            maxLength={150}
            value={signedName}
            onChange={(event) => setSignedName(event.target.value)}
          />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Signed copy (PDF or photo)</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </label>
          <ErrorMessage message={record.error && getApiErrorMessage(record.error)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRecording(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={record.isPending || signedName.trim().length < 2}>
              <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {record.isPending ? 'Saving…' : 'Record signature'}
            </Button>
          </div>
        </form>
      )}
    </Section>
  )
}

function LinkSection({ student, canManage, onChanged }) {
  const [copied, setCopied] = useState(false)
  const issue = useMutation({
    mutationFn: (regenerate) => studentPortalService.issueLink(student.id, { regenerate }),
    onSuccess: onChanged,
  })
  // Built from this page's own origin: the link is served by the same
  // frontend the staff are using, at /s/<token>.
  const url = student.portal_path ? `${window.location.origin}${student.portal_path}` : null
  const number = whatsappNumber(student.phone)
  const message = url
    ? `Hi ${student.name}, here is your HRNAVINOS student link. Please read and accept the Terms & Conditions to unlock your classes and recordings: ${url}`
    : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy the link:', url)
    }
  }

  return (
    <Section title="Private link" icon={Link2}>
      {url ? (
        <div className="space-y-2">
          <p className="break-all rounded bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {number && (
              <Button
                variant="secondary"
                onClick={() =>
                  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
                }
              >
                <MessageCircle className="h-4 w-4 text-green-600" strokeWidth={2} aria-hidden="true" />
                Send on WhatsApp
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                className="text-slate-500"
                disabled={issue.isPending}
                title="Issue a new link - the current one stops working"
                onClick={() => {
                  if (window.confirm('Replace this link? The current one stops working straight away.')) issue.mutate(true)
                }}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                New link
              </Button>
            )}
          </div>
        </div>
      ) : canManage ? (
        <Button onClick={() => issue.mutate(false)} disabled={issue.isPending}>
          <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {issue.isPending ? 'Creating…' : 'Create link'}
        </Button>
      ) : (
        <p className="text-xs text-slate-500">No link has been issued yet.</p>
      )}
      <ErrorMessage message={issue.error && getApiErrorMessage(issue.error)} />
    </Section>
  )
}

function ClassLine({ entry, studentId, canMark, onChanged }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-slate-800">
          <span className="font-medium">
            {entry.sequence}. {entry.title}
          </span>
          <span className="ml-2 text-xs text-slate-500">{formatDate(entry.held_on)}</span>
        </p>
        <div className="flex items-center gap-2">
          <AttendanceBadge attended={entry.attended} via={entry.via} />
          {entry.held && (
            <AttendanceControl
              sessionId={entry.session_id}
              studentId={studentId}
              override={entry.override}
              disabled={!canMark}
              onChanged={onChanged}
            />
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-expanded={open}
            title="Absentee call remarks"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {entry.call_remarks.length}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 border-l-2 border-slate-200 pl-3">
          <RemarkThread
            sessionId={entry.session_id}
            studentId={studentId}
            remarks={entry.call_remarks}
            canAdd={canMark}
            onAdded={onChanged}
          />
        </div>
      )}
    </li>
  )
}

/** One student: their terms signature, their private link, and every class. */
export function PortalStudentModal({ studentId, canMark, canManage, onClose }) {
  const refresh = usePortalRefresh()
  const query = useQuery({
    queryKey: ['portal-student', studentId],
    queryFn: () => studentPortalService.student(studentId),
  })
  const student = query.data

  return (
    <Modal title={student?.name ?? 'Student'} isOpen onClose={onClose} maxWidth="max-w-3xl">
      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.isError ? (
        <ErrorMessage message={getApiErrorMessage(query.error)} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>{student.email}</span>
            {student.phone && <span>{student.phone}</span>}
            {student.batch_name && <span>{student.batch_name}</span>}
            {student.course_name && <span>{student.course_name}</span>}
            <Badge tone={student.status === 'active' ? 'green' : student.status === 'dropped' ? 'red' : 'slate'}>
              {titleCase(student.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            Attendance <PercentBadge percent={student.totals.percent} />
            <span className="text-xs text-slate-500">
              {student.totals.attended} of {student.totals.held} classes · {student.totals.live} live ·{' '}
              {student.totals.recording} recording · {student.totals.manual} marked
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TermsSection student={student} canManage={canManage} onChanged={refresh} />
            <LinkSection student={student} canManage={canManage} onChanged={refresh} />
          </div>

          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {student.sessions.length ? (
              student.sessions.map((entry) => (
                <ClassLine
                  key={entry.session_id}
                  entry={entry}
                  studentId={student.id}
                  canMark={canMark}
                  onChanged={refresh}
                />
              ))
            ) : (
              <li className="px-3 py-6 text-center text-sm text-slate-400">No classes scheduled for this batch yet.</li>
            )}
          </ul>
        </div>
      )}
    </Modal>
  )
}
