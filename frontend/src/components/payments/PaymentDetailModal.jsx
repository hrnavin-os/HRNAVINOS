import { Calendar, CheckCircle2, CircleDollarSign, CreditCard, Hash, Phone, Wallet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
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
  return items
}

// Single-shot plans have exactly one installment, already fully covered by
// the Paid/Due Amount cards above - the schedule breakdown only earns its
// keep once there's more than one payment to track (two-shot or EMI).
function InstallmentScheduleRow({ installment }) {
  const isPaid = installment.paid
  const tone = isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
  const Icon = isPaid ? CheckCircle2 : Calendar
  const statusText = isPaid ? 'Paid' : installment.scheduled_at ? `Due ${formatDate(installment.scheduled_at)}` : 'Not scheduled yet'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{installment.label}</p>
          <p className={`text-xs font-medium ${isPaid ? 'text-emerald-600' : 'text-slate-500'}`}>{statusText}</p>
        </div>
      </div>
      <p className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(installment.amount)}</p>
    </div>
  )
}

// The info-cards/proof/installment-schedule body, with no header of its
// own - reused both by the standalone modal below (which adds its own
// avatar/name header) and by the Lead Detail Modal's Payment Details tab
// (whose parent modal already shows the lead's name).
export function PaymentDetailContent({ lead, error }) {
  const summary = getLeadPaymentSummary(lead)

  return (
    <div className="space-y-4">
      <ErrorMessage message={error} />

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
          <div className="space-y-2">
            {lead.installments.map((installment, index) => (
              <InstallmentScheduleRow key={index} installment={installment} />
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
export function PaymentDetailModal({ lead, title, statusBadge, onClose, error, footer }) {
  return (
    <Modal title={title} isOpen onClose={onClose} maxWidth="max-w-lg">
      <div className="-mt-2 space-y-4">
        <div className="flex items-center gap-3">
          <LeadAvatar name={lead.name} size="h-12 w-12" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{lead.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {statusBadge}
              {lead.payment_plan && (
                <Badge tone="blue">{PAYMENT_PLAN_LABELS[lead.payment_plan] ?? lead.payment_plan}</Badge>
              )}
            </div>
          </div>
        </div>

        <PaymentDetailContent lead={lead} error={error} />

        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">{footer}</div>}
      </div>
    </Modal>
  )
}
