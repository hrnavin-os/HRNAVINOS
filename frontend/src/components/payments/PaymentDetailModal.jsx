import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  BellRing,
  Calendar,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  CreditCard,
  GraduationCap,
  Hash,
  Mail,
  Phone,
  Wallet,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getAfterPlacementFee, getEmiPaymentHealth, getLeadPaymentSummary } from '@/utils/leadPayment'
import { PAYMENT_PLAN_LABELS, INSTALLMENT_MODE_TONES } from '@/constants/installmentPaymentModes'
import { PAYMENT_PLAN_TONES } from '@/constants/paymentOptions'
import { MEDIA_BASE_URL } from '@/constants/config'

// Same accent-per-fact treatment as the Lead Detail Modal's overview cards,
// so the two "read this lead's info at a glance" surfaces look consistent.
const INFO_TONE_CLASSES = {
  blue: 'bg-blue-100 text-blue-600',
  rose: 'bg-rose-100 text-rose-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  violet: 'bg-violet-100 text-violet-600',
  cyan: 'bg-cyan-100 text-cyan-600',
  amber: 'bg-amber-100 text-amber-600',
}

function buildInfoItems(lead, summary) {
  const afterPlacement = getAfterPlacementFee(lead)
  const items = [
    { icon: Phone, label: 'Contact', value: lead.phone, tone: 'blue' },
    { icon: Calendar, label: 'Date', value: formatDate(lead.created_at), tone: 'rose' },
    {
      icon: Wallet,
      label: 'Paid Amount',
      value: summary.paidAmount !== null ? formatCurrency(summary.paidAmount) : '—',
      tone: 'emerald',
    },
    { icon: CreditCard, label: 'Payment Mode', value: summary.mode ? titleCase(summary.mode) : '—', tone: 'violet' },
  ]
  if (summary.mode) {
    const isUpi = summary.mode === 'upi'
    items.push({
      icon: Hash,
      label: isUpi ? 'UPI ID' : 'Transaction ID',
      value: (isUpi ? summary.upiId : summary.transactionId) ?? '—',
      tone: 'cyan',
    })
  }
  items.push({
    icon: CircleDollarSign,
    label: 'Due Amount',
    value: summary.hasPlan ? formatCurrency(summary.dueAmount) : '—',
    tone: 'amber',
  })
  // Owed only once the student is placed, so it sits apart from Due Amount
  // (what's outstanding on the training fee right now).
  items.push({
    icon: GraduationCap,
    label: 'After Placement',
    value: afterPlacement ?? '—',
    tone: 'teal',
  })
  if (lead.email) {
    items.push({ icon: Mail, label: 'Email', value: lead.email, tone: 'blue' })
  }
  return items
}

// The three amounts Finance can chase, each only offered when there is
// actually something outstanding - a button that sends a reminder about a
// settled balance is worse than no button.
function buildReminderKinds(lead, summary) {
  const kinds = []
  const unpaidInstallments = (lead.installments ?? []).filter((installment) => !installment.paid).length

  if (summary.hasPlan && summary.dueAmount > 0) {
    kinds.push({
      kind: lead.payment_plan === 'emi_6_weeks' ? 'emi' : 'due',
      label: lead.payment_plan === 'emi_6_weeks' ? 'Remind: EMI' : 'Remind: Due',
      detail:
        lead.payment_plan === 'emi_6_weeks'
          ? `${unpaidInstallments} instalment${unpaidInstallments === 1 ? '' : 's'} left · ${formatCurrency(summary.dueAmount)}`
          : formatCurrency(summary.dueAmount),
    })
  }

  const afterPlacement = getAfterPlacementFee(lead)
  if (afterPlacement && !/^nil$/i.test(afterPlacement)) {
    kinds.push({ kind: 'after_placement', label: 'Remind: After placement', detail: afterPlacement })
  }

  return kinds
}

// Sends the lead's section admins a reminder to chase a payment. Rendered
// only where a caller opts in (Finance's Cashbook popup), since a Section
// Admin viewing their own lead has nobody to forward it to.
function PaymentReminders({ lead, summary }) {
  const [sent, setSent] = useState(null)
  // Which kinds have been sent from this popup. `mutation.isPending` only
  // covers the in-flight request, so it does nothing about the far more likely
  // second press a moment after the first one lands - which is what was
  // stacking duplicate reminders in the admin's panel.
  const [sentKinds, setSentKinds] = useState([])
  const kinds = buildReminderKinds(lead, summary)

  const mutation = useMutation({
    mutationFn: ({ kind }) => leadService.sendPaymentReminder(lead.id, { kind }),
    onSuccess: (data, { kind }) => {
      setSent(data.message)
      setSentKinds((current) => [...current, kind])
    },
  })

  if (kinds.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
        <p className="text-sm font-medium text-slate-700">Ask this section&rsquo;s admin to follow up</p>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Sends a notification to the admins of {lead.section ? `section ${lead.section.toUpperCase()}` : 'this lead’s section'}. Opening it moves the
        lead to Follow up call.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {kinds.map((item) => {
          const isSent = sentKinds.includes(item.kind)
          return (
            <Button
              key={item.kind}
              variant={isSent ? 'success' : 'secondary'}
              onClick={() => mutation.mutate({ kind: item.kind })}
              disabled={mutation.isPending || isSent}
              title={isSent ? 'Already sent from this popup' : undefined}
            >
              {isSent && <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
              {isSent ? 'Sent' : item.label}
              {!isSent && <span className="text-xs font-normal text-slate-400">{item.detail}</span>}
            </Button>
          )
        })}
      </div>

      <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />
      {sent && !mutation.error && <p className="mt-2 text-xs font-medium text-emerald-600">{sent}</p>}

      <NonPaymentAction lead={lead} summary={summary} />
    </div>
  )
}

// The end of the road for a reminder that went unanswered. Separated from the
// reminders above by a rule and coloured red, because it is a different kind of
// act: a reminder asks somebody to chase the money, this declares it isn't
// coming and starts the student's removal from the batch group.
//
// Goes to the HR Coordinators, not the section admins - taking somebody out of
// a group is their job, and the removal is what marks the student Lost.
function NonPaymentAction({ lead, summary }) {
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(null)

  const outstanding = summary.dueAmount > 0 ? summary.dueAmount : null

  const mutation = useMutation({
    mutationFn: () => leadService.reportNonPayment(lead.id, { amount: outstanding }),
    onSuccess: (data) => {
      setDone(data.message)
      setConfirming(false)
    },
  })

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      {done ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <CircleAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {done}
        </p>
      ) : confirming ? (
        // Confirmed rather than fired on the first press: this one ends with a
        // student being marked Lost, which is not something to do by mis-click.
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">Report {lead.name} as not paid?</p>
          <p className="mt-0.5 text-xs text-red-700">
            HR will be asked to remove them from the batch WhatsApp group, which marks them Lost.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Reporting…' : 'Yes, report to HR'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
          <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
        >
          <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          Didn&rsquo;t pay
          {outstanding ? <span className="text-xs font-semibold">{formatCurrency(outstanding)}</span> : null}
        </button>
      )}
    </div>
  )
}

// Single-shot plans have exactly one installment, already fully covered by
// the Paid/Due Amount cards above - the schedule breakdown only earns its
// keep once there's more than one payment to track (two-shot or EMI). Cards
// lay out in a horizontally-scrolling row rather than a stacked list, so a
// 6-installment EMI plan reads as a timeline instead of a tall column.
function InstallmentScheduleCard({ installment }) {
  const isPaid = installment.paid
  const tone = isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
  const Icon = isPaid ? CheckCircle2 : Calendar
  const dateLabel = isPaid ? 'Payment Date' : 'Due Date'
  const dateValue = isPaid ? installment.paid_at : installment.scheduled_at

  return (
    <div className="w-44 shrink-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="truncate text-sm font-semibold text-slate-900">{installment.label}</p>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(installment.amount)}</p>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{dateLabel}</p>
      <p className={`text-xs font-medium ${isPaid ? 'text-emerald-600' : 'text-slate-600'}`}>
        {dateValue ? formatDate(dateValue) : 'Not scheduled yet'}
      </p>
    </div>
  )
}

// Missed-EMI warning banner: a plain visibility notice once one payment is
// overdue (this is what a Section Admin sees, read-only, via the Lead Detail
// modal), escalating to a "Mark Lost" action once a caller opts in via
// `onMarkLost` (only Finance's Cashbook popup does - see mark_lost_nonpayment
// on the backend, which also notifies every HR Coordinator).
function PaymentHealthBanner({ health, onMarkLost, isMarkingLost }) {
  if (health.status === 'missed_once') {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-amber-700">1st Due Missed — one EMI payment is overdue.</p>
      </div>
    )
  }

  if (health.status === 'lost_eligible') {
    return (
      <div className="flex items-center justify-between gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600">
            <AlertTriangle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-red-700">2 consecutive EMI payments missed.</p>
        </div>
        {onMarkLost && (
          <Button variant="danger" onClick={onMarkLost} disabled={isMarkingLost}>
            {isMarkingLost ? 'Marking…' : 'Mark Lost'}
          </Button>
        )}
      </div>
    )
  }

  return null
}

// The info-cards/proof/installment-schedule body, with no header of its
// own - reused both by the standalone modal below (which adds its own
// avatar/name header) and by the Lead Detail Modal's Payment Details tab
// (whose parent modal already shows the lead's name).
export function PaymentDetailContent({ lead, error, onMarkLost, isMarkingLost, showReminders = false }) {
  const summary = getLeadPaymentSummary(lead)
  const health = getEmiPaymentHealth(lead)

  return (
    <div className="space-y-4">
      <ErrorMessage message={error} />

      <PaymentHealthBanner health={health} onMarkLost={onMarkLost} isMarkingLost={isMarkingLost} />

      {showReminders && <PaymentReminders lead={lead} summary={summary} />}

      <div className="grid grid-cols-2 gap-2.5">
        {buildInfoItems(lead, summary).map((item) => (
          <div key={item.label} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${INFO_TONE_CLASSES[item.tone]}`}>
              <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
              <p className="truncate text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {lead.course_interest && (
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Course Interest — </span>
          {lead.course_interest}
        </p>
      )}

      {summary.proofUrl && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Payment Proof</p>
          <img
            src={`${MEDIA_BASE_URL}${summary.proofUrl}`}
            alt="Payment proof"
            className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
          />
        </div>
      )}

      {lead.installments?.length > 1 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            {lead.payment_plan === 'emi_6_weeks' ? 'EMI Schedule' : 'Payment Schedule'}
          </p>
          <div className="table-scroll flex gap-2.5 overflow-x-auto pb-1.5">
            {lead.installments.map((installment, index) => (
              <InstallmentScheduleCard key={index} installment={installment} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Read-only payment detail view shared by the Approvals "Review" popup and
// the Cashbook "view details" popup - only the title/status badge/footer
// actions differ between the two.
export function PaymentDetailModal({
  lead,
  title,
  statusBadge,
  onClose,
  error,
  footer,
  onMarkLost,
  isMarkingLost,
  showReminders = false,
}) {
  const summary = getLeadPaymentSummary(lead)

  return (
    <Modal title={title} isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="-mt-2 space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <LeadAvatar name={lead.name} size="h-12 w-12" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{lead.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {statusBadge}
              {/* Same tone maps as the Cashbook table, so a plan and a mode
                  keep the colour they had in the row you clicked. */}
              {lead.payment_plan && (
                <Badge tone={PAYMENT_PLAN_TONES[lead.payment_plan] ?? 'slate'}>
                  {PAYMENT_PLAN_LABELS[lead.payment_plan] ?? lead.payment_plan}
                </Badge>
              )}
              {summary.mode && (
                <Badge tone={INSTALLMENT_MODE_TONES[summary.mode] ?? 'slate'}>{titleCase(summary.mode)}</Badge>
              )}
              {lead.section && <Badge tone="slate">Section {lead.section.toUpperCase()}</Badge>}
            </div>
          </div>
        </div>

        <PaymentDetailContent
          lead={lead}
          error={error}
          onMarkLost={onMarkLost}
          isMarkingLost={isMarkingLost}
          showReminders={showReminders}
        />

        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">{footer}</div>}
      </div>
    </Modal>
  )
}
