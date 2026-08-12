import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  CircleAlert,
  ClipboardList,
  History,
  Layers,
  Mail,
  MessageCircle,
  Phone,
  Send,
  UserMinus,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { DetailPanel } from '@/components/leads/InductionEntryDetail'
import { WhatsAppStatusPill } from '@/components/hr/WhatsAppStatusPill'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { WHATSAPP_ACTION_LABELS } from '@/constants/whatsappStatus'
import { formatDateTime } from '@/utils/formatters'

const dash = <span className="text-slate-400">—</span>

function Field({ icon: Icon, label, value, tone = 'slate' }) {
  const plate = {
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    slate: 'bg-slate-100 text-slate-500',
  }[tone]

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${plate}`}>
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{value || dash}</p>
      </div>
    </div>
  )
}

// Everything about one candidate's group onboarding in one place, so the row
// can stop carrying four buttons and a history icon - at that width the
// actions column was pushing the table into a horizontal scroll.
export function WhatsAppStudentModal({ student, onClose, onInvite, onJoined, onFollowUp, onRemove, isBusy }) {
  const historyQuery = useQuery({
    queryKey: ['whatsapp-onboarding', 'history', student.id],
    queryFn: () => batchConfirmationService.whatsappHistory(student.id),
  })

  const joined = student.whatsapp_status === 'joined'
  const invited = student.whatsapp_status !== 'not_invited'

  const header = (
    <div className="flex min-w-0 items-center gap-3">
      <LeadAvatar name={student.name} size="h-11 w-11" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-slate-900">{student.name}</h2>
          <WhatsAppStatusPill status={student.whatsapp_status} />
          {student.non_payment_reported_at && (
            <Badge tone="red">
              <CircleAlert className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              Didn&rsquo;t pay
            </Badge>
          )}
        </div>
        <p className="text-sm text-slate-500">{student.phone}</p>
      </div>
    </div>
  )

  return (
    <Modal header={header} isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Finance's flag leads, because on a flagged row it is the reason
            anybody opened this at all. */}
        {student.non_payment_reported_at && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 border-l-4 border-l-red-400 bg-red-50 p-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={2} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">
                Finance reported non-payment
                {student.non_payment_amount
                  ? ` — ₹${Number(student.non_payment_amount).toLocaleString('en-IN')} outstanding`
                  : ''}
              </p>
              <p className="text-xs text-red-700">
                Reported {formatDateTime(student.non_payment_reported_at)}. Remove them from the group and the
                list, which marks them Lost.
              </p>
            </div>
          </div>
        )}

        <DetailPanel title="Candidate" icon={ClipboardList} tone="blue">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field icon={Phone} label="Mobile" value={student.phone} tone="blue" />
            <Field icon={Mail} label="Email" value={student.email} tone="violet" />
            <Field icon={BookOpen} label="Course" value={student.course_interest} tone="emerald" />
            <Field icon={Layers} label="Batch" value={student.batch} tone="amber" />
          </div>
          {student.section && (
            <p className="mt-2 text-xs text-slate-500">
              Section <Badge tone="violet">{student.section.toUpperCase()}</Badge>
            </p>
          )}
        </DetailPanel>

        <DetailPanel title="Group Onboarding" icon={MessageCircle} tone="emerald">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              icon={Send}
              label="Invite sent"
              value={
                student.whatsapp_invite_sent_at
                  ? `${formatDateTime(student.whatsapp_invite_sent_at)}${
                      student.whatsapp_invite_count > 1 ? ` · ${student.whatsapp_invite_count} attempts` : ''
                    }`
                  : null
              }
              tone="amber"
            />
            <Field
              icon={MessageCircle}
              label="Joined"
              value={student.joined_at ? formatDateTime(student.joined_at) : null}
              tone="emerald"
            />
            <Field
              icon={History}
              label="Last follow-up"
              value={
                student.whatsapp_last_follow_up_at
                  ? formatDateTime(student.whatsapp_last_follow_up_at)
                  : null
              }
              tone="slate"
            />
            <Field
              icon={ClipboardList}
              label="Coordinator"
              value={student.whatsapp_handled_by_name}
              tone="blue"
            />
          </div>
        </DetailPanel>

        <DetailPanel title="History" icon={History} tone="slate">
          {historyQuery.isLoading ? (
            <LoadingSpinner />
          ) : historyQuery.data?.length ? (
            <ol className="space-y-2.5">
              {historyQuery.data.map((entry, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {WHATSAPP_ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(entry.created_at)}
                      {entry.user_name ? ` · ${entry.user_name}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Nothing recorded yet. Sending the first invite starts this.</p>
          )}
        </DetailPanel>

        {/* Every action for this candidate, in one row, instead of spread
            across a table column that has to fit them all at 90px wide. */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" className="text-red-600!" disabled={isBusy} onClick={() => onRemove(student)}>
            <UserMinus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Remove &amp; mark Lost
          </Button>
          {student.whatsapp_status === 'follow_up_required' && (
            <Button variant="secondary" disabled={isBusy} onClick={() => onFollowUp(student.id)}>
              Log follow-up
            </Button>
          )}
          {!joined && (
            <Button variant="secondary" disabled={isBusy} onClick={() => onInvite(student.id)}>
              <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {invited ? 'Resend invite' : 'Send invite'}
            </Button>
          )}
          {!joined && invited && (
            <Button variant="success" disabled={isBusy} onClick={() => onJoined(student.id)}>
              Mark joined
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
