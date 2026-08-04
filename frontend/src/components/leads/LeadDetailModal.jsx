import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  ImagePlus,
  Info,
  Mail,
  MessageSquare,
  Milestone,
  Pencil,
  Phone,
  Plus,
  Tag,
  Trash2,
  UserPlus,
  UserRound,
  Wallet,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatLeadSource, LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { INSTALLMENT_MODE_OPTIONS, PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { leadService } from '@/services/leadService'
import { foundationFormService } from '@/services/foundationFormService'
import { PaymentDetailContent } from '@/components/payments/PaymentDetailModal'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDateTime, titleCase } from '@/utils/formatters'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { MEDIA_BASE_URL } from '@/constants/config'

// Financial Approval and Batch Confirmation are pipeline gates: each is only
// reachable from the stage directly before it, and once a lead reaches
// Batch Confirmation it can't move back (Lost stays reachable as an exit).
// Mirrors the backend's validation in LeadService._validate_stage_transition.
function isStageBlocked(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) return false
  if (currentStatus === 'batch_confirmation') return targetStatus !== 'lost'
  if (targetStatus === 'batch_confirmation') return currentStatus !== 'financial_approval'
  if (targetStatus === 'financial_approval') return currentStatus !== 'pre_screening'
  return false
}

function stageBlockedReason(targetStatus) {
  if (targetStatus === 'batch_confirmation') return 'Move through Financial Approval first'
  if (targetStatus === 'financial_approval') return 'Complete Follow up call first'
  return "A lead in Batch Confirmation can't move back to an earlier stage"
}

const STAGE_BUTTON_TONES = {
  blue: { active: 'border-blue-600 bg-blue-600 text-white', inactive: 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50' },
  red: { active: 'border-red-600 bg-red-600 text-white', inactive: 'border-red-300 bg-white text-red-700 hover:bg-red-50' },
  amber: {
    active: 'border-amber-500 bg-amber-500 text-white',
    inactive: 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50',
  },
  violet: {
    active: 'border-violet-600 bg-violet-600 text-white',
    inactive: 'border-violet-300 bg-white text-violet-700 hover:bg-violet-50',
  },
  emerald: {
    active: 'border-emerald-600 bg-emerald-600 text-white',
    inactive: 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50',
  },
  slate: {
    active: 'border-slate-600 bg-slate-600 text-white',
    inactive: 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
  },
}

const ACTION_ICONS = { CREATE: Plus, UPDATE: Pencil, ASSIGN: UserPlus, DELETE: Trash2 }
const ACTION_TONES = {
  CREATE: 'bg-emerald-100 text-emerald-600',
  UPDATE: 'bg-blue-100 text-blue-600',
  ASSIGN: 'bg-violet-100 text-violet-600',
  DELETE: 'bg-red-100 text-red-600',
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: Info },
  { key: 'payment', label: 'Payment Details', icon: Wallet },
  { key: 'followup', label: 'Follow-up', icon: CalendarClock },
  { key: 'timeline', label: 'Timeline', icon: Clock },
]

function toDateTimeInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Each info card gets its own accent color so the overview reads as a set of
// distinct facts at a glance, rather than a monotone list.
const INFO_TONE_CLASSES = {
  blue: { icon: 'bg-blue-100 text-blue-600', label: 'text-blue-500' },
  violet: { icon: 'bg-violet-100 text-violet-600', label: 'text-violet-500' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', label: 'text-emerald-500' },
  purple: { icon: 'bg-purple-100 text-purple-600', label: 'text-purple-500' },
  cyan: { icon: 'bg-cyan-100 text-cyan-600', label: 'text-cyan-500' },
  rose: { icon: 'bg-rose-100 text-rose-600', label: 'text-rose-500' },
}

const INFO_ITEMS = (lead) => [
  { key: 'phone', icon: Phone, label: 'Phone', value: lead.phone, tone: 'blue' },
  { key: 'email', icon: Mail, label: 'Email', value: lead.email ?? '—', tone: 'violet' },
  { key: 'source', icon: Tag, label: 'Source', value: formatLeadSource(lead.source), tone: 'emerald' },
  { key: 'course_interest', icon: BookOpen, label: 'Course Interest', value: lead.course_interest ?? '—', tone: 'purple' },
]

const TRAILING_INFO_ITEMS = (lead) => [
  { key: 'assigned_to', icon: UserRound, label: 'Assigned To', value: lead.assigned_to_name ?? 'Unassigned', tone: 'cyan' },
  { key: 'created', icon: Calendar, label: 'Created', value: formatDateTime(lead.created_at), tone: 'rose' },
]

function InfoCard({ item }) {
  const tones = INFO_TONE_CLASSES[item.tone] ?? INFO_TONE_CLASSES.blue
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tones.icon}`}>
        <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${tones.label}`}>{item.label}</p>
        <p className="break-words text-sm font-semibold text-slate-900">{item.value}</p>
      </div>
    </div>
  )
}

// payment_expected arrives as "<plan summary> | Pays on: <weekday> (<date>)" from
// the backend when a payment timeline was collected - split it so the "Pays on"
// half reads as a secondary line instead of running on into the same sentence.
function PaymentExpectedCard({ value }) {
  const [main, ...rest] = value.split(' | ')
  const paysOn = rest.join(' | ') || null
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
        <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Payment Expected</p>
        <p className="break-words text-sm font-semibold text-slate-900">{main}</p>
        {paysOn && <p className="mt-0.5 break-words text-xs font-medium text-amber-700">{paysOn}</p>}
      </div>
    </div>
  )
}

// Fallback for leads without a payment_plan yet (manually created in the
// CRM, or an older Foundation Form submission from before this field
// existed) - staff pick the same program/plan a student would have, which
// pre-populates installments from the same pricing table either way.
function PlanAssignmentForm({ onAssign, isAssigning, error }) {
  const pricingQuery = useQuery({ queryKey: ['foundation-form-pricing'], queryFn: foundationFormService.getPricing })
  const [programInterest, setProgramInterest] = useState('')
  const [paymentPlan, setPaymentPlan] = useState('')

  if (pricingQuery.isLoading) return <LoadingSpinner />
  if (pricingQuery.isError) return <ErrorMessage message={getApiErrorMessage(pricingQuery.error)} />

  const { programs, categories } = pricingQuery.data
  const selectedProgram = programs.find((program) => program.value === programInterest)
  const category = selectedProgram ? categories[selectedProgram.category] : null

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <Wallet className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-slate-800">
          Follow-Up : payment selected by student in foundation form
        </p>
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <Select
          label="Program"
          value={programInterest}
          onChange={(event) => {
            setProgramInterest(event.target.value)
            setPaymentPlan('')
          }}
        >
          <option value="">Select a program</option>
          {programs.map((program) => (
            <option key={program.value} value={program.value}>
              {program.label}
            </option>
          ))}
        </Select>

        {category && (
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Payment Plan</legend>
            <div className="space-y-2">
              {category.plans.map((plan) => (
                <label
                  key={plan.value}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 p-3 text-sm
                    has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="payment_plan_choice"
                    value={plan.value}
                    checked={paymentPlan === plan.value}
                    onChange={(event) => setPaymentPlan(event.target.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-slate-800">{plan.label}</span>
                    {' - '}
                    {plan.summary}
                    {' | '}After Placement - {plan.after_placement}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <ErrorMessage message={error} />

        <div className="flex justify-end">
          <Button
            onClick={() => onAssign({ programInterest, paymentPlan })}
            disabled={isAssigning || !programInterest || !paymentPlan}
          >
            {isAssigning ? 'Saving…' : 'Assign Plan'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function InstallmentRow({ lead, installment, index, onSave, isSaving }) {
  const isTwoShotSecond = lead.payment_plan === 'two_shot' && index === 1
  const [showPaidFields, setShowPaidFields] = useState(!isTwoShotSecond || installment.paid || Boolean(installment.mode))
  const [file, setFile] = useState(null)
  const [amount, setAmount] = useState(installment.amount ?? '')
  const [mode, setMode] = useState(installment.mode ?? '')
  const [transactionId, setTransactionId] = useState(installment.transaction_id ?? '')
  const [upiId, setUpiId] = useState(installment.upi_id ?? '')
  const [scheduledAt, setScheduledAt] = useState(installment.scheduled_at ?? '')
  const [validationError, setValidationError] = useState(null)
  const fileInputRef = useRef(null)

  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file)
    if (installment.proof_url) return `${MEDIA_BASE_URL}${installment.proof_url}`
    return null
  }, [file, installment.proof_url])

  function handleSaveSchedule() {
    if (!scheduledAt) {
      setValidationError('Please pick a scheduled date before saving.')
      return
    }
    setValidationError(null)
    onSave(index, { scheduledAt })
  }

  function handleSavePayment() {
    const missing =
      !amount ||
      !mode ||
      (mode === 'upi' ? !upiId : !transactionId) ||
      (!file && !installment.proof_url)
    if (missing) {
      setValidationError('Please fill in the amount, mode, ID, and payment proof before saving.')
      return
    }
    setValidationError(null)
    onSave(index, { file, amount, mode, transactionId, upiId })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {index + 1}
        </span>
        <p className="text-base font-semibold text-slate-900">{installment.label}</p>
      </div>

      {isTwoShotSecond && !showPaidFields ? (
        <div className="space-y-3">
          <Input
            type="date"
            label="Scheduled Date"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="rounded-xl!"
          />
          <ErrorMessage message={validationError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPaidFields(true)}>
              Payment received — fill details
            </Button>
            <Button onClick={handleSaveSchedule} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save schedule'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            label="Payment Amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-xl!"
          />
          <Select
            label="Payment Mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="rounded-xl!"
          >
            <option value="">Select Mode</option>
            {INSTALLMENT_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {(mode === 'card' || mode === 'netbanking') && (
            <Input
              label="Transaction ID"
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              className="rounded-xl!"
            />
          )}
          {mode === 'upi' && (
            <Input
              label="UPI ID"
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
              className="rounded-xl!"
            />
          )}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <ImagePlus className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
              Payment Proof
            </label>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Payment proof"
                className="mb-2 max-h-40 w-full rounded-md border border-slate-200 object-contain"
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {file || installment.proof_url ? 'Change Image' : 'Upload Image'}
              </Button>
              {(file || installment.proof_url) && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {file ? file.name : 'Uploaded'}
                </span>
              )}
            </div>
          </div>
          <ErrorMessage message={validationError} />
          <div className="flex justify-end">
            <Button
              variant={installment.paid ? 'success' : 'primary'}
              onClick={handleSavePayment}
              disabled={isSaving}
            >
              {isSaving ? (
                'Saving…'
              ) : installment.paid ? (
                <>
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Paid
                </>
              ) : (
                'Save payment'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentCollectionSection({
  lead,
  onAssignPlan,
  isAssigningPlan,
  assignPlanError,
  onSaveInstallment,
  savingIndex,
}) {
  if (!lead.payment_plan) {
    return <PlanAssignmentForm onAssign={onAssignPlan} isAssigning={isAssigningPlan} error={assignPlanError} />
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600">
          <Wallet className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{lead.course_interest}</p>
          <Badge tone="blue">{PAYMENT_PLAN_LABELS[lead.payment_plan] ?? lead.payment_plan}</Badge>
        </div>
      </div>
      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {lead.installments.map((installment, index) => (
          <InstallmentRow
            key={index}
            lead={lead}
            installment={installment}
            index={index}
            onSave={onSaveInstallment}
            isSaving={savingIndex === index}
          />
        ))}
      </div>
    </div>
  )
}

function OverviewTab({
  lead,
  onSelectStage,
  isSaving,
  onAssignPlan,
  isAssigningPlan,
  assignPlanError,
  onSaveInstallment,
  savingInstallmentIndex,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {INFO_ITEMS(lead).map((item) => (
          <InfoCard key={item.key} item={item} />
        ))}
      </div>

      {lead.payment_expected && <PaymentExpectedCard value={lead.payment_expected} />}

      <div className="grid grid-cols-2 gap-2.5">
        {TRAILING_INFO_ITEMS(lead).map((item) => (
          <InfoCard key={item.key} item={item} />
        ))}
      </div>

      {lead.notes && (
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <MessageSquare className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
            Notes
          </p>
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{lead.notes}</p>
        </div>
      )}

      {lead.status === 'pre_screening' && (
        <div className="border-t border-slate-100 pt-4">
          <PaymentCollectionSection
            lead={lead}
            onAssignPlan={onAssignPlan}
            isAssigningPlan={isAssigningPlan}
            assignPlanError={assignPlanError}
            onSaveInstallment={onSaveInstallment}
            savingIndex={savingInstallmentIndex}
          />
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Milestone className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
          Move to Stage
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LEAD_STAGES.map((stage) => {
            const isActive = lead.status === stage.value
            const tones = STAGE_BUTTON_TONES[stage.tone] ?? STAGE_BUTTON_TONES.slate
            const blockedByFlow = isStageBlocked(lead.status, stage.value)
            return (
              <button
                key={stage.value}
                type="button"
                onClick={() => onSelectStage(stage.value)}
                disabled={isSaving || blockedByFlow}
                title={blockedByFlow ? stageBlockedReason(stage.value) : undefined}
                className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive ? tones.active : tones.inactive
                }`}
              >
                {stage.label}
                {isActive && <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Full read-only payment breakdown (paid/due amounts, mode, proof,
// installment schedule) - the same content the Payments module's review
// popups show, reused here since a lead's own detail view is the more
// natural place to check it than a separate eye-icon trigger in the table.
function PaymentDetailsTab({ lead }) {
  return (
    <div className="space-y-4">
      {lead.payment_plan && <Badge tone="blue">{PAYMENT_PLAN_LABELS[lead.payment_plan] ?? lead.payment_plan}</Badge>}
      <PaymentDetailContent lead={lead} />
    </div>
  )
}

function FollowUpTab({ followUpAt, setFollowUpAt, history, onSave, isSaving, onClose }) {
  return (
    <div className="space-y-4">
      <Input
        type="datetime-local"
        label="Schedule next follow-up"
        value={followUpAt}
        onChange={(event) => setFollowUpAt(event.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save follow-up'}
        </Button>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <CalendarClock className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
          Follow-up history
        </p>
        {history.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No follow-ups scheduled yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={`${entry.scheduled_at}-${entry.created_at}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{formatDateTime(entry.scheduled_at)}</p>
                <p className="text-xs text-slate-500">Scheduled on {formatDateTime(entry.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TimelineTab({ leadId }) {
  const timelineQuery = useQuery({ queryKey: ['lead-timeline', leadId], queryFn: () => leadService.getTimeline(leadId) })

  if (timelineQuery.isLoading) return <LoadingSpinner />
  if (timelineQuery.error) return <ErrorMessage message={getApiErrorMessage(timelineQuery.error)} />

  const entries = timelineQuery.data ?? []
  if (entries.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No activity recorded yet.</p>
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const Icon = ACTION_ICONS[entry.action] ?? Clock
        return (
          <li key={entry.id} className="flex gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACTION_TONES[entry.action] ?? 'bg-slate-100 text-slate-500'}`}>
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 border-b border-slate-100 pb-3">
              <p className="text-sm font-medium text-slate-900">
                {titleCase(entry.action)} {entry.user_name ? `by ${entry.user_name}` : ''}
              </p>
              <p className="text-xs text-slate-400">{formatDateTime(entry.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function LeadDetailModal({ lead, onClose }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')
  const [followUpAt, setFollowUpAt] = useState(toDateTimeInputValue(lead.follow_up_at))
  // Mirrors the lead prop but gets refreshed from each mutation's response,
  // so e.g. saving installment 1 of an EMI plan shows "Paid" on that row
  // immediately instead of only after the modal is reopened.
  const [liveLead, setLiveLead] = useState(lead)
  const [savingInstallmentIndex, setSavingInstallmentIndex] = useState(null)

  function invalidateLeadQueries() {
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
    queryClient.invalidateQueries({ queryKey: ['lead-timeline', lead.id] })
  }

  const stageMutation = useMutation({
    mutationFn: (newStatus) => leadService.update(lead.id, { status: newStatus }),
    onSuccess: () => {
      invalidateLeadQueries()
      onClose()
    },
  })

  const followUpMutation = useMutation({
    mutationFn: () =>
      leadService.update(lead.id, { follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null }),
    onSuccess: () => {
      invalidateLeadQueries()
      onClose()
    },
  })

  const planMutation = useMutation({
    mutationFn: (values) => leadService.assignPlan(lead.id, values),
    onSuccess: (updatedLead) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
    },
  })

  const installmentMutation = useMutation({
    mutationFn: ({ index, values }) => leadService.updateInstallment(lead.id, index, values),
    onSuccess: (updatedLead) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
    },
    onSettled: () => setSavingInstallmentIndex(null),
  })

  function handleSaveInstallment(index, values) {
    setSavingInstallmentIndex(index)
    installmentMutation.mutate({ index, values })
  }

  const activeError = stageMutation.error || followUpMutation.error || installmentMutation.error
  const stageInfo = LEAD_STAGE_BY_VALUE[liveLead.status]

  const header = (
    <div className="flex min-w-0 items-center gap-3">
      <LeadAvatar name={lead.name} size="h-11 w-11" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-slate-900">{lead.name}</h2>
          <Badge outline tone={stageInfo?.tone ?? 'slate'}>
            {stageInfo?.label ?? titleCase(liveLead.status)}
          </Badge>
        </div>
        <p className="text-sm text-slate-500">{lead.phone}</p>
      </div>
    </div>
  )

  return (
    <Modal header={header} isOpen onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <ErrorMessage message={activeError ? getApiErrorMessage(activeError) : null} />

        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 pb-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-brand-600 text-brand-600'
                  : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <OverviewTab
            lead={liveLead}
            onSelectStage={(newStatus) => stageMutation.mutate(newStatus)}
            isSaving={stageMutation.isPending}
            onAssignPlan={(values) => planMutation.mutate(values)}
            isAssigningPlan={planMutation.isPending}
            assignPlanError={planMutation.error ? getApiErrorMessage(planMutation.error) : null}
            onSaveInstallment={handleSaveInstallment}
            savingInstallmentIndex={savingInstallmentIndex}
          />
        )}
        {activeTab === 'payment' && <PaymentDetailsTab lead={liveLead} />}
        {activeTab === 'followup' && (
          <FollowUpTab
            followUpAt={followUpAt}
            setFollowUpAt={setFollowUpAt}
            history={liveLead.follow_up_history ?? []}
            onSave={() => followUpMutation.mutate()}
            isSaving={followUpMutation.isPending}
            onClose={onClose}
          />
        )}
        {activeTab === 'timeline' && <TimelineTab leadId={lead.id} />}
      </div>
    </Modal>
  )
}
