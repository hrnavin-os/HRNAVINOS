import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  ImagePlus,
  Info,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Milestone,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Trash2,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { INSTALLMENT_MODE_OPTIONS, PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { PAYMENT_PLAN_TONES } from '@/constants/paymentOptions'
import { leadService } from '@/services/leadService'
import { foundationFormService } from '@/services/foundationFormService'
import { PaymentDetailContent } from '@/components/payments/PaymentDetailModal'
import { hasFirstPayment } from '@/utils/leadPayment'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDate, formatDateTime, titleCase } from '@/utils/formatters'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { DetailPanel, InductionEntryDetail } from '@/components/leads/InductionEntryDetail'
import { MEDIA_BASE_URL } from '@/constants/config'

// Financial Approval and Batch Confirmation are pipeline gates: each is only
// reachable from the stage directly before it, Financial Approval also needs
// a first payment on record, and once a lead reaches Batch Confirmation it
// can't move back (Lost stays reachable as an exit). Mirrors the backend's
// LeadService._validate_stage_transition so a blocked button explains itself
// up front instead of failing the request after the click.
// Returns the reason a move is blocked, or null when it's allowed.
function stageBlockReason(lead, targetStatus) {
  if (lead.status === targetStatus) return null
  if (lead.status === 'batch_confirmation') {
    return targetStatus === 'lost' ? null : "A lead in Batch Confirmation can't move back to an earlier stage"
  }
  if (targetStatus === 'batch_confirmation') {
    return lead.status === 'financial_approval' ? null : 'Move through Financial Approval first'
  }
  if (targetStatus === 'financial_approval') {
    if (lead.status !== 'pre_screening') return 'Complete Follow up call first'
    if (!hasFirstPayment(lead)) return 'Record the first payment before moving to Financial Approval'
  }
  return null
}

// Only the stage you're on is coloured. Six differently-tinted outline buttons
// gave every destination equal claim on your attention and turned the picker
// into a paint chart - and the colour was decoration anyway, since choosing
// where to move a lead depends on which stage is current and which are
// blocked, not on what hue each one owns. Lost keeps a red hover as the one
// genuinely irreversible move.
const STAGE_ACTIVE_TONES = {
  blue: 'border-blue-600 bg-blue-600 text-white',
  red: 'border-red-600 bg-red-600 text-white',
  amber: 'border-amber-500 bg-amber-500 text-white',
  violet: 'border-violet-600 bg-violet-600 text-white',
  emerald: 'border-emerald-600 bg-emerald-600 text-white',
  slate: 'border-slate-600 bg-slate-600 text-white',
}

const STAGE_IDLE = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
const STAGE_IDLE_LOST = 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700'

const ACTION_ICONS = { CREATE: Plus, UPDATE: Pencil, ASSIGN: UserPlus, DELETE: Trash2 }
const ACTION_TONES = {
  CREATE: 'bg-emerald-100 text-emerald-600',
  UPDATE: 'bg-blue-100 text-blue-600',
  ASSIGN: 'bg-violet-100 text-violet-600',
  DELETE: 'bg-red-100 text-red-600',
}

// Induction is conditional - only leads matched to an induction entry have one,
// and an empty tab on the rest would read as missing data rather than as a lead
// that arrived through the form directly.
const TABS = [
  { key: 'overview', label: 'Overview', icon: Info },
  { key: 'induction', label: 'Induction', icon: PhoneCall, matchedOnly: true },
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

// Each info card gets its own accent so the overview reads as a set of
// distinct facts rather than a monotone list. The accent lives on the icon
// plate only - the label went back to neutral slate because six differently
// coloured labels competed with the values they were labelling, and the
// lighter ones (cyan, emerald) were hard to read at this size.
const INFO_TONE_CLASSES = {
  blue: 'bg-linear-to-br from-blue-500 to-blue-700',
  violet: 'bg-linear-to-br from-violet-500 to-violet-700',
  emerald: 'bg-linear-to-br from-emerald-500 to-emerald-700',
  purple: 'bg-linear-to-br from-purple-500 to-purple-700',
  cyan: 'bg-linear-to-br from-cyan-500 to-cyan-700',
  rose: 'bg-linear-to-br from-rose-500 to-rose-700',
}

// Source, Assigned To and Created were dropped as noise: the first two are
// near-constant across this board and the third is already the Date column in
// the table you opened this from.
const INFO_ITEMS = (lead) => [
  { key: 'phone', icon: Phone, label: 'Phone', value: lead.phone, tone: 'blue' },
  { key: 'email', icon: Mail, label: 'Email', value: lead.email ?? '—', tone: 'violet' },
  { key: 'course_interest', icon: BookOpen, label: 'Course Interest', value: lead.course_interest ?? '—', tone: 'purple' },
]

function InfoCard({ item }) {
  const plate = INFO_TONE_CLASSES[item.tone] ?? INFO_TONE_CLASSES.blue
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${plate}`}>
        <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
        <p className="break-words text-sm font-semibold text-slate-900">{item.value}</p>
      </div>
    </div>
  )
}

// payment_expected is composed by the backend to a fixed shape - see
// foundation_form_pricing.build_payment_expected_summary and the timeline
// suffix in foundation_form_service:
//
//   "<plan> - <total> (<instalment>) (After Placement: <fee>) | Pays on: <day> (<date>)"
//
// Parsed back apart rather than shown whole. As one line it was four separate
// facts - which plan, how much, what's owed after placement, and when they
// said they'd pay - run together in a sentence you had to read to the end of
// to find any of them.
//
// Returns nulls if it doesn't match: leads predating this format, or a value
// typed by hand, fall back to the original single line rather than being
// mangled into the wrong fields.
const PAYS_ON = /^Pays on:\s*(.+?)\s*\(([^)]+)\)\s*$/

function parsePaymentExpected(value) {
  const [main, ...rest] = value.split(' | ')
  const paysOnRaw = rest.join(' | ') || null

  // A submission that gave a payment timeline but chose no plan has the
  // timeline as the entire value, with no plan half in front of it - so the
  // "Pays on" text is `main` itself and there is nothing else to read.
  const timeline = paysOnRaw ?? (PAYS_ON.test(main) ? main : null)
  const planPart = timeline === main ? '' : main

  const afterMatch = planPart.match(/\(After Placement:\s*([^)]+)\)\s*$/)
  const afterPlacement = afterMatch?.[1].trim() ?? null
  const head = (afterMatch ? planPart.slice(0, afterMatch.index) : planPart).trim()

  const dashAt = head.indexOf(' - ')
  const plan = dashAt === -1 ? null : head.slice(0, dashAt).trim()
  const amount = dashAt === -1 ? head : head.slice(dashAt + 3).trim()

  // "₹15,000 (₹7,500 Per Month)" -> total, then the per-instalment breakdown.
  const amountMatch = amount.match(/^(.*?)\s*\((.+)\)$/)
  const total = amountMatch?.[1].trim() ?? amount
  const perInstalment = amountMatch?.[2].trim() ?? null

  const paysMatch = timeline?.match(PAYS_ON)

  return {
    plan,
    total,
    perInstalment,
    afterPlacement,
    paysOnDay: paysMatch?.[1] ?? null,
    paysOnDate: paysMatch?.[2] ?? null,
    paysOnRaw: timeline,
  }
}

function ExpectedField({ label, value, hint, tone = 'slate' }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`truncate text-sm font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`} title={value}>
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}

function PaymentExpectedPanel({ value }) {
  const parsed = parsePaymentExpected(value)

  return (
    <DetailPanel title="Payment Expected" icon={Wallet} tone="amber">
      {parsed.plan || parsed.paysOnDate ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {parsed.plan && <ExpectedField label="Plan" value={parsed.plan} />}
          {parsed.plan && <ExpectedField label="Training Fee" value={parsed.total} hint={parsed.perInstalment} />}
          {parsed.afterPlacement && (
            <ExpectedField label="After Placement" value={parsed.afterPlacement} tone="amber" />
          )}
          {parsed.paysOnDate && (
            <ExpectedField
              label="Pays On"
              value={formatDate(parsed.paysOnDate)}
              hint={parsed.paysOnDay}
              tone="amber"
            />
          )}
        </div>
      ) : (
        <>
          <p className="break-words text-sm font-semibold text-slate-900">{value.split(' | ')[0]}</p>
          {parsed.paysOnRaw && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              {parsed.paysOnRaw}
            </p>
          )}
        </>
      )}
    </DetailPanel>
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

function InstallmentRow({ lead, installment, index, onSave, isSaving, justSaved = false }) {
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

  // Every createObjectURL above pins its blob in memory until it's revoked,
  // and picking a different image just made another one. Only the blob URLs
  // are revoked - the stored proof is a plain URL and revoking it is a no-op,
  // but checking `file` keeps the intent obvious.
  useEffect(() => {
    if (!file || !previewUrl) return undefined
    return () => URL.revokeObjectURL(previewUrl)
  }, [file, previewUrl])

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

  const hasProof = Boolean(file || installment.proof_url)

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white ${
        installment.paid ? 'border-emerald-200' : 'border-slate-200'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3.5 py-2 ${
          installment.paid ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            installment.paid ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {installment.paid ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{installment.label}</p>
        {/* Settled rows are the common case once a plan is running - saying so
            here means you don't have to read the form below to know. */}
        {installment.paid && <Badge tone="emerald">Paid</Badge>}
      </div>

      <div className="p-3.5">
        {isTwoShotSecond && !showPaidFields ? (
          <div className="space-y-3">
            <Input
              type="date"
              label="Scheduled Date"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
            <ErrorMessage message={validationError} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowPaidFields(true)}>
                Payment received — fill details
              </Button>
              <Button variant={justSaved ? 'success' : 'primary'} onClick={handleSaveSchedule} disabled={isSaving}>
                {isSaving ? (
                  'Saving…'
                ) : justSaved ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Saved
                  </>
                ) : (
                  'Save schedule'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Amount and mode side by side: they're one thought ("how much,
                how"), and stacked in a half-width card they pushed the proof
                and the save button off the bottom of the popup. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Payment Amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Select label="Payment Mode" value={mode} onChange={(event) => setMode(event.target.value)}>
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
                />
              )}
              {mode === 'upi' && (
                <Input label="UPI ID" value={upiId} onChange={(event) => setUpiId(event.target.value)} />
              )}
            </div>

            {/* A fixed thumbnail rather than the full image. Proofs are phone
                screenshots - tall and narrow - and rendered full-width with
                object-contain each one sat in a band of white taller than the
                rest of the form. Cropped to a square it reads as "there is a
                proof, here's roughly what it is"; View opens the real thing. */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
                Payment Proof
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div
                className={`flex items-center gap-3 rounded-lg border p-2 ${
                  hasProof ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'
                }`}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Payment proof"
                    className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                    <ImagePlus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700" title={file?.name}>
                    {file ? file.name : installment.proof_url ? 'Proof on file' : 'No proof uploaded'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {hasProof ? 'Replace' : 'Upload image'}
                    </button>
                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        View
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <ErrorMessage message={validationError} />
            <div className="flex justify-end border-t border-slate-100 pt-3">
              {/* `justSaved` wins over `paid` for a few seconds so the click gets
                  an acknowledgement of its own - going straight to "Paid" left
                  it ambiguous whether this save had actually landed or the row
                  was already settled beforehand. */}
              <Button
                variant={justSaved || installment.paid ? 'success' : 'primary'}
                onClick={handleSavePayment}
                disabled={isSaving}
              >
                {isSaving ? (
                  'Saving…'
                ) : justSaved ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Saved
                  </>
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
  savedIndex,
}) {
  if (!lead.payment_plan) {
    return <PlanAssignmentForm onAssign={onAssignPlan} isAssigning={isAssigningPlan} error={assignPlanError} />
  }

  return (
    // The same panel every other block on this tab uses. It previously had a
    // bespoke header to avoid nesting frames, but once the rest of the tab
    // became panels that made payment collection the one section that looked
    // like it came from somewhere else - and panel-around-cards is one level
    // of nesting, not the three the old note was avoiding.
    <DetailPanel
      title="Payment Collection"
      icon={Wallet}
      tone="emerald"
      action={
        <Badge tone={PAYMENT_PLAN_TONES[lead.payment_plan] ?? 'blue'}>
          {PAYMENT_PLAN_LABELS[lead.payment_plan] ?? lead.payment_plan}
        </Badge>
      }
    >
      {lead.course_interest && (
        <p className="mb-3 truncate text-sm font-semibold text-slate-900">{lead.course_interest}</p>
      )}
      {/* Two across for a plan with several installments - each card is a short
          form, and stretched full width the fields looked lost. A single-shot
          plan has exactly one, though, and half a row for it left the card
          squeezed into a narrow column beside dead space, with every field
          stacked down it. One installment gets the full width.
          No max-height on purpose: the modal body is already the scroll
          container, and a second one nested inside it gave the popup two
          scrollbars side by side. */}
      <div className={`grid grid-cols-1 gap-3 ${lead.installments.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {lead.installments.map((installment, index) => (
          <InstallmentRow
            key={index}
            lead={lead}
            installment={installment}
            index={index}
            onSave={onSaveInstallment}
            isSaving={savingIndex === index}
            justSaved={savedIndex === index}
          />
        ))}
      </div>
    </DetailPanel>
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
  savedInstallmentIndex,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {INFO_ITEMS(lead).map((item) => (
          <InfoCard key={item.key} item={item} />
        ))}
      </div>

      {lead.payment_expected && <PaymentExpectedPanel value={lead.payment_expected} />}

      {lead.notes && (
        <DetailPanel title="Notes" icon={MessageSquare} tone="violet">
          <p className="break-words text-sm leading-relaxed text-slate-700">{lead.notes}</p>
        </DetailPanel>
      )}

      {lead.status === 'pre_screening' && (
        <PaymentCollectionSection
          lead={lead}
          onAssignPlan={onAssignPlan}
          isAssigningPlan={isAssigningPlan}
          assignPlanError={assignPlanError}
          onSaveInstallment={onSaveInstallment}
          savingIndex={savingInstallmentIndex}
          savedIndex={savedInstallmentIndex}
        />
      )}

      <DetailPanel
        title="Move to Stage"
        icon={Milestone}
        tone="slate"
        action={
          <span className="text-[11px] font-medium text-slate-400">
            Currently {LEAD_STAGE_BY_VALUE[lead.status]?.label ?? titleCase(lead.status)}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LEAD_STAGES.map((stage) => {
            const isActive = lead.status === stage.value
            const blockReason = stageBlockReason(lead, stage.value)
            const idle = stage.value === 'lost' ? STAGE_IDLE_LOST : STAGE_IDLE
            return (
              <button
                key={stage.value}
                type="button"
                onClick={() => onSelectStage(stage.value)}
                disabled={isSaving || Boolean(blockReason)}
                title={blockReason ?? undefined}
                className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${
                  isActive ? `${STAGE_ACTIVE_TONES[stage.tone] ?? STAGE_ACTIVE_TONES.slate} font-semibold` : idle
                }`}
              >
                {/* Marks the gated stages, so "you can't go there yet" is
                    visible without hovering for the tooltip that says why. */}
                {blockReason && !isActive && (
                  <Lock className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                )}
                {stage.label}
                {isActive && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </DetailPanel>
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

// The induction call this lead came from. Fetched here rather than carried on
// the lead, since the board's list would otherwise pay for a record only this
// tab ever shows.
function InductionTab({ leadId }) {
  const inductionQuery = useQuery({
    queryKey: ['lead-induction', leadId],
    queryFn: () => leadService.getInduction(leadId),
  })

  if (inductionQuery.isLoading) return <LoadingSpinner />
  if (inductionQuery.error) return <ErrorMessage message={getApiErrorMessage(inductionQuery.error)} />

  const entry = inductionQuery.data
  if (!entry) {
    // Reachable if the entry was deleted after the match was made - the link
    // survives on the lead, the record behind it doesn't.
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">The linked induction entry is no longer available.</p>
  }

  return (
    <div className="space-y-3">
      {/* One line, not a paragraph. The tab is called Induction and everything
          under it is plainly the induction record, so the banner only has to
          say what joined the two and when - it was explaining the obvious at
          the cost of the first screenful. */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />
        <p className="min-w-0 text-sm text-emerald-900">
          <span className="font-semibold">Matched on mobile number</span>
          {entry.converted_at && (
            <span className="text-emerald-700"> · moved {formatDateTime(entry.converted_at)}</span>
          )}
        </p>
      </div>
      <InductionEntryDetail entry={entry} />
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
  const [savedInstallmentIndex, setSavedInstallmentIndex] = useState(null)
  const [pendingLostStage, setPendingLostStage] = useState(false)
  const [lostReason, setLostReason] = useState('')

  function invalidateLeadQueries() {
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
    queryClient.invalidateQueries({ queryKey: ['lead-timeline', lead.id] })
  }

  const stageMutation = useMutation({
    mutationFn: ({ status, lostReason }) =>
      leadService.update(lead.id, lostReason ? { status, lost_reason: lostReason } : { status }),
    onSuccess: () => {
      invalidateLeadQueries()
      onClose()
    },
  })

  // Moving to Lost needs a reason (the server rejects it without one), so
  // that stage alone routes through a prompt instead of firing immediately.
  function selectStage(newStatus) {
    if (newStatus === 'lost') {
      setPendingLostStage(true)
      return
    }
    stageMutation.mutate({ status: newStatus })
  }

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
    // Keyed off onSuccess, not onSettled: onSettled also fires on failure, and
    // a row that says "Saved" after the request errored is worse than one that
    // says nothing.
    onSuccess: (updatedLead, { index }) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
      setSavedInstallmentIndex(index)
    },
    onSettled: () => setSavingInstallmentIndex(null),
  })

  // Clears the "Saved" confirmation after a beat so the button settles back to
  // its real state ("Paid", or the schedule button) rather than claiming to be
  // a save receipt forever.
  useEffect(() => {
    if (savedInstallmentIndex === null) return undefined
    const timer = setTimeout(() => setSavedInstallmentIndex(null), 2500)
    return () => clearTimeout(timer)
  }, [savedInstallmentIndex])

  function handleSaveInstallment(index, values) {
    setSavingInstallmentIndex(index)
    installmentMutation.mutate({ index, values })
  }

  const activeError = stageMutation.error || followUpMutation.error || installmentMutation.error
  const stageInfo = LEAD_STAGE_BY_VALUE[liveLead.status]
  const visibleTabs = TABS.filter((tab) => !tab.matchedOnly || liveLead.induction_matched)

  const header = (
    <div className="flex min-w-0 items-center gap-3">
      <LeadAvatar name={lead.name} size="h-11 w-11" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-slate-900">{lead.name}</h2>
          <Badge outline tone={stageInfo?.tone ?? 'slate'}>
            {stageInfo?.label ?? titleCase(liveLead.status)}
          </Badge>
          {/* Says where the lead came from at a glance, so you know whether
              there's an induction history to read before hunting for the tab. */}
          {liveLead.induction_matched && (
            <Badge tone="emerald">
              <Link2 className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              From Induction
            </Badge>
          )}
        </div>
        <p className="text-sm text-slate-500">{lead.phone}</p>
      </div>
    </div>
  )

  return (
    <Modal header={header} isOpen onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <ErrorMessage message={activeError ? getApiErrorMessage(activeError) : null} />

        {/* Scrolls sideways rather than wrapping: five tabs don't fit a phone,
            and wrapped onto two lines they stop reading as one tab strip.
            table-scroll gives them the app's own slim scrollbar. */}
        <div className="table-scroll flex gap-1 overflow-x-auto border-b border-slate-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-2 text-sm font-semibold transition-colors ${
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
            onSelectStage={selectStage}
            isSaving={stageMutation.isPending}
            onAssignPlan={(values) => planMutation.mutate(values)}
            isAssigningPlan={planMutation.isPending}
            assignPlanError={planMutation.error ? getApiErrorMessage(planMutation.error) : null}
            onSaveInstallment={handleSaveInstallment}
            savingInstallmentIndex={savingInstallmentIndex}
            savedInstallmentIndex={savedInstallmentIndex}
          />
        )}
        {activeTab === 'induction' && <InductionTab leadId={lead.id} />}
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

        {pendingLostStage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="mb-2 text-sm font-semibold text-red-700">Why is this lead being marked Lost?</p>
            <Input
              autoFocus
              placeholder="e.g. Joined elsewhere, not interested, unreachable…"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPendingLostStage(false)
                  setLostReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!lostReason.trim() || stageMutation.isPending}
                onClick={() => stageMutation.mutate({ status: 'lost', lostReason: lostReason.trim() })}
              >
                {stageMutation.isPending ? 'Saving…' : 'Mark Lost'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
