import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
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
  RotateCcw,
  Trash2,
  Undo2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import {
  INSTALLMENT_MODE_LABELS,
  INSTALLMENT_MODE_OPTIONS,
  PAYMENT_PLAN_LABELS,
} from '@/constants/installmentPaymentModes'
import { PAYMENT_PLAN_TONES, QR_CODE_OPTIONS } from '@/constants/paymentOptions'
import { leadService } from '@/services/leadService'
import { foundationFormService } from '@/services/foundationFormService'
import { PaymentDetailContent } from '@/components/payments/PaymentDetailModal'
import { getPaymentLedger, hasFirstPayment } from '@/utils/leadPayment'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate, formatDateTime, titleCase } from '@/utils/formatters'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { DetailPanel, InductionEntryDetail } from '@/components/leads/InductionEntryDetail'
import { MEDIA_BASE_URL } from '@/constants/config'
import { DateTimePicker, isFutureDateTime } from '@/components/ui/DateTimePicker'
import { Calendar } from '@/components/ui/DatePresetFilter'

// Any stage is reachable from any other, either way round (a move back asks
// why). The one gate is money: Partially Paid, Financial Approval and Batch
// Confirmation all mean a payment has landed, so none opens until the first
// one is on record. Mirrors the backend's LeadService._validate_stage_transition
// so a blocked button explains itself up front instead of failing the request
// after the click.
// Returns the reason a move is blocked, or null when it's allowed.
const PAID_STAGES = ['partially_paid', 'financial_approval', 'batch_confirmation']

function stageBlockReason(lead, targetStatus) {
  if (lead.status === targetStatus) return null
  if (PAID_STAGES.includes(targetStatus) && !hasFirstPayment(lead)) {
    return `Record the first payment before moving to ${stageLabel(targetStatus)}`
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
  cyan: 'border-cyan-700 bg-cyan-700 text-white',
  violet: 'border-violet-600 bg-violet-600 text-white',
  emerald: 'border-emerald-600 bg-emerald-600 text-white',
  slate: 'border-slate-600 bg-slate-600 text-white',
}

const STAGE_IDLE = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
const STAGE_IDLE_LOST = 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700'

const ACTION_ICONS = {
  CREATE: Plus,
  UPDATE: Pencil,
  ASSIGN: UserPlus,
  DELETE: Trash2,
  REJOIN: RotateCcw,
  STAGE_BACK: Undo2,
  DELETE_PAYMENT: Trash2,
}
const ACTION_TONES = {
  CREATE: 'bg-emerald-100 text-emerald-600',
  UPDATE: 'bg-blue-100 text-blue-600',
  ASSIGN: 'bg-violet-100 text-violet-600',
  DELETE: 'bg-red-100 text-red-600',
  // Its own entry rather than an UPDATE, because "this student came back" is
  // the one thing you scan a lost-and-returned lead's history for.
  REJOIN: 'bg-teal-100 text-teal-600',
  // A move back undoes somebody's progress, so it stands out from the edits.
  STAGE_BACK: 'bg-amber-100 text-amber-600',
  DELETE_PAYMENT: 'bg-red-100 text-red-600',
}

// The pipeline in order, for telling a move back from a move forward. Quit is
// the exit rather than a step (it asks its own question). Mirrors
// LeadService._STAGE_ORDER on the backend, which refuses a move back with no
// reason.
const STAGE_ORDER = ['new_lead', 'rnr', 'pre_screening', 'partially_paid', 'financial_approval', 'batch_confirmation']

function isStageReversal(current, target) {
  const from = STAGE_ORDER.indexOf(current)
  const to = STAGE_ORDER.indexOf(target)
  return from !== -1 && to !== -1 && to < from
}

function stageLabel(value) {
  return LEAD_STAGE_BY_VALUE[value]?.label ?? titleCase(value ?? '')
}

// What a timeline entry says happened. Stage moves are spelled out with where
// the lead came from and went to, and the reason given - the rest stay a plain
// "Update by ...", as they always were.
function describeTimelineEntry(entry) {
  const changes = entry.changes ?? {}
  const by = entry.user_name ? ` by ${entry.user_name}` : ''
  if (entry.action === 'STAGE_BACK') {
    return {
      title: `Moved back to ${stageLabel(changes.status)}${by}`,
      detail: changes.previous_status ? `from ${stageLabel(changes.previous_status)}` : null,
      reason: changes.reason ?? null,
    }
  }
  if (entry.action === 'DELETE_PAYMENT') {
    return {
      title: `Deleted ${changes.payment ?? 'a payment'} of ${formatCurrency(Number(changes.received_amount ?? 0))}${by}`,
      detail: [INSTALLMENT_MODE_LABELS[changes.mode] ?? changes.mode, changes.qr_code].filter(Boolean).join(' · ') || null,
      reason: changes.reason ?? null,
    }
  }
  if (entry.action === 'UPDATE' && changes.status) {
    return {
      title: `Moved to ${stageLabel(changes.status)}${by}`,
      detail: changes.previous_status ? `from ${stageLabel(changes.previous_status)}` : null,
      reason: changes.status === 'lost' ? (changes.lost_reason ?? null) : null,
    }
  }
  return { title: `${titleCase(entry.action)}${by}`, detail: null, reason: null }
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
  blue: 'bg-blue-600',
  violet: 'bg-violet-600',
  emerald: 'bg-emerald-600',
  purple: 'bg-purple-600',
  cyan: 'bg-cyan-600',
  rose: 'bg-rose-600',
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
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white ${plate}`}>
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
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600">
          <Wallet className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-slate-800">
          Follow-Up : payment selected by student in foundation form
        </p>
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
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

// One payment proof: a square thumbnail that opens the full image, with a
// corner button to take it off while the payment is being edited.
function ProofThumb({ href, title, isNew = false, onRemove }) {
  return (
    <div className="relative">
      <a href={href} target="_blank" rel="noreferrer" title={title ?? 'View proof'}>
        <img
          src={href}
          alt="Payment proof"
          className={`h-14 w-14 rounded-md border object-cover ${isNew ? 'border-brand-300' : 'border-slate-200'}`}
        />
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove proof"
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-red-600"
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// The QR Code menu's "add a new one" entry - not a value anybody could name an
// account.
const ADD_QR_CODE = '__add_qr_code__'

// The built-in accounts, then any added on leads since, then the one this
// payment already carries if it's neither (a retired name still shows).
// Shares its cache key with the board's QR filter, which reads the same list.
function useQrCodeOptions(current) {
  const added = useQuery({
    queryKey: ['lead-field-options', 'qr_code'],
    queryFn: () => leadService.getFieldOptions('qr_code'),
  }).data ?? []
  const names = QR_CODE_OPTIONS.map((option) => option.value)
  const known = new Set(names.map((name) => name.toLowerCase()))
  for (const name of [...added, current]) {
    if (name && !known.has(name.toLowerCase())) {
      names.push(name)
      known.add(name.toLowerCase())
    }
  }
  return names
}

const asAmount = (value) => (value === '' || value === null || value === undefined ? 0 : Number(value))

// One token or payment. A form while it is being recorded or corrected, and a
// one-glance summary once saved: six full forms for six payments pushed the
// balance off the bottom of the popup, and a saved payment is read far more
// often than it is corrected.
function PaymentCard({
  kind,
  title,
  number,
  entry,
  due,
  balanceDueAt,
  onSave,
  onRemove,
  isSaving,
  justSaved = false,
  error,
  // Admins only (PAYMENT_DELETE_ROLES) - absent for everyone else.
  onDelete,
  isDeleting = false,
  deleteError,
}) {
  const isDraft = !entry
  const isToken = kind === 'token'
  const [editing, setEditing] = useState(isDraft)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  // New images picked but not yet saved, and saved ones marked for removal.
  const [files, setFiles] = useState([])
  const [removed, setRemoved] = useState([])
  const [remarks, setRemarks] = useState(entry?.remarks ?? '')
  // What came in. Left empty on a new one rather than filled with the due
  // amount: this is money, and a figure nobody typed is one nobody checked.
  const [received, setReceived] = useState(entry?.received_amount ?? entry?.amount ?? '')
  const [mode, setMode] = useState(entry?.mode ?? '')
  // The account the money went into.
  const [qrCode, setQrCode] = useState(entry?.qr_code ?? '')
  const [isAddingQr, setIsAddingQr] = useState(false)
  const qrOptions = useQrCodeOptions(qrCode)
  const [transactionId, setTransactionId] = useState(entry?.transaction_id ?? '')
  const [upiId, setUpiId] = useState(entry?.upi_id ?? '')
  const [balanceDate, setBalanceDate] = useState('')
  const [validationError, setValidationError] = useState(null)
  const fileInputRef = useRef(null)

  // Entries saved before several proofs were possible carry only the single
  // `proof_url`.
  const storedKey = (entry?.proof_urls?.length ? entry.proof_urls : [entry?.proof_url])
    .filter(Boolean)
    .join('|')
  const stored = useMemo(() => (storedKey ? storedKey.split('|') : []), [storedKey])
  const kept = stored.filter((url) => !removed.includes(url))

  // Once a save lands the server's list is the truth: what was picked is now
  // in it, and what was removed is gone from it.
  useEffect(() => {
    setFiles([])
    setRemoved([])
  }, [storedKey])

  // A correction that saved folds back to its summary.
  useEffect(() => {
    if (justSaved && !isDraft) setEditing(false)
  }, [justSaved, isDraft])

  const filePreviews = useMemo(() => files.map((picked) => URL.createObjectURL(picked)), [files])
  // Every createObjectURL pins its blob in memory until it's revoked.
  useEffect(() => () => filePreviews.forEach((url) => URL.revokeObjectURL(url)), [filePreviews])

  // What this card can take: everything owed, plus what it already holds if it
  // is a correction. Whatever it leaves is the balance.
  const available = due + asAmount(entry?.amount)
  const remaining = available - asAmount(received)
  const needsBalanceDate = remaining > 0 && !balanceDueAt
  const hasProof = Boolean(files.length || kept.length)

  function cancelEdit() {
    setRemarks(entry.remarks ?? '')
    setReceived(entry.received_amount ?? entry.amount ?? '')
    setMode(entry.mode ?? '')
    setQrCode(entry.qr_code ?? '')
    setIsAddingQr(false)
    setTransactionId(entry.transaction_id ?? '')
    setUpiId(entry.upi_id ?? '')
    setFiles([])
    setRemoved([])
    setValidationError(null)
    setEditing(false)
  }

  function handleSave() {
    if (!received || Number(received) <= 0 || !mode) {
      setValidationError('Fill in the amount received and the payment mode before saving.')
      return
    }
    // The token is optional money up front, so its proof can follow later.
    if (!isToken && !hasProof) {
      setValidationError('Add at least one payment proof before saving.')
      return
    }
    if (remaining < 0) {
      setValidationError(`That is more than the ${formatCurrency(available)} still due.`)
      return
    }
    if (needsBalanceDate && !balanceDate) {
      setValidationError(`Pick the date the remaining ${formatCurrency(remaining)} will be paid.`)
      return
    }
    setValidationError(null)
    onSave({
      files,
      removeProofUrls: removed,
      remarks,
      receivedAmount: received,
      mode,
      qrCode,
      transactionId,
      upiId,
      balanceDueAt: needsBalanceDate ? balanceDate : undefined,
    })
  }

  return (
    <div className={`overflow-hidden rounded-lg border bg-white ${entry ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div
        className={`flex items-center gap-2 border-b px-3.5 py-2 ${
          entry ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            entry ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {entry ? (
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
          ) : isToken ? (
            <Wallet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          ) : (
            number
          )}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{title}</p>
        {justSaved ? (
          <Badge tone="emerald">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            Saved
          </Badge>
        ) : entry ? (
          <Badge tone="emerald">Paid</Badge>
        ) : (
          isToken && <Badge tone="slate">Optional</Badge>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this payment"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="p-3.5">
        {!editing ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(entry.received_amount ?? entry.amount)}
              </p>
              {entry.paid_at && <p className="text-xs text-slate-500">{formatDate(entry.paid_at)}</p>}
            </div>
            <p className="text-sm text-slate-600">
              {[INSTALLMENT_MODE_LABELS[entry.mode] ?? entry.mode, entry.qr_code, entry.transaction_id || entry.upi_id]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {entry.remarks && <p className="break-words text-sm text-slate-500">{entry.remarks}</p>}
            {stored.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stored.map((url) => (
                  <ProofThumb key={url} href={`${MEDIA_BASE_URL}${url}`} />
                ))}
              </div>
            )}
            {confirmingDelete ? (
              // Asked rather than fired on the press: this takes money off the
              // books, and the reason is what the timeline keeps of it.
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">
                  Delete this {isToken ? 'token' : 'payment'} of {formatCurrency(entry.received_amount ?? entry.amount)}?
                </p>
                <p className="mt-0.5 text-xs text-red-700">
                  It goes back onto the balance due. The lead&rsquo;s timeline keeps what was deleted and why.
                </p>
                <div className="mt-2.5">
                  <Input
                    autoFocus
                    label="Reason"
                    maxLength={500}
                    placeholder="e.g. Added by mistake - duplicate entry"
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                  />
                </div>
                <ErrorMessage message={deleteError} />
                <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirmingDelete(false)
                      setDeleteReason('')
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => onDelete(deleteReason.trim())}
                    disabled={isDeleting || deleteReason.trim().length < 3}
                  >
                    {isDeleting ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
                {onDelete && (
                  <Button variant="reject" className="px-3! py-1! text-xs" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    Delete
                  </Button>
                )}
                <Button variant="secondary" className="px-3! py-1! text-xs" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Amount and mode side by side: they're one thought ("how much,
                how"), and stacked in a half-width card they pushed the proof
                and the save button off the bottom of the popup. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Amount Received"
                type="number"
                step="0.01"
                min="0"
                placeholder={available > 0 ? `Up to ${available}` : undefined}
                value={received}
                onChange={(event) => setReceived(event.target.value)}
              />
              <Select label="Payment Mode" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="">Select Mode</option>
                {INSTALLMENT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {/* Straight after the mode: which account it was paid into. The
                  list is a roster that grows, so a new account can be typed. */}
              <div className="sm:col-span-2">
                {isAddingQr ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        autoFocus
                        label="QR Code"
                        placeholder="New QR code / account name"
                        maxLength={100}
                        value={qrCode}
                        onChange={(event) => setQrCode(event.target.value)}
                      />
                    </div>
                    <Button variant="secondary" onClick={() => setIsAddingQr(false)}>
                      Pick from list
                    </Button>
                  </div>
                ) : (
                  <Select
                    label="QR Code"
                    value={qrCode}
                    onChange={(event) => {
                      if (event.target.value === ADD_QR_CODE) {
                        setQrCode('')
                        setIsAddingQr(true)
                      } else {
                        setQrCode(event.target.value)
                      }
                    }}
                  >
                    <option value="">Select QR Code</option>
                    {qrOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={ADD_QR_CODE}>+ Add new…</option>
                  </Select>
                )}
              </div>
              {/* Full width: alone in half a row it left a hole beside it. */}
              {(mode === 'card' || mode === 'netbanking') && (
                <div className="sm:col-span-2">
                  <Input
                    label="Transaction ID (optional)"
                    value={transactionId}
                    onChange={(event) => setTransactionId(event.target.value)}
                  />
                </div>
              )}
              {mode === 'upi' && (
                <div className="sm:col-span-2">
                  <Input label="UPI ID (optional)" value={upiId} onChange={(event) => setUpiId(event.target.value)} />
                </div>
              )}
            </div>

            {/* What this leaves owing. The first payment short of the fee asks
                when the rest is coming - the due reminders run off that date;
                after that the date lives in Balance Due below. */}
            {received !== '' && Number(received) > 0 && remaining > 0 && (
              <div className="grid grid-cols-1 items-end gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Remaining Due</p>
                  <p className="text-lg font-semibold text-amber-800">{formatCurrency(remaining)}</p>
                </div>
                {needsBalanceDate ? (
                  <Input
                    type="date"
                    label="Remaining Due Date"
                    value={balanceDate}
                    onChange={(event) => setBalanceDate(event.target.value)}
                  />
                ) : (
                  <p className="text-xs text-amber-700">
                    Due {formatDate(balanceDueAt)} - change it under Balance Due.
                  </p>
                )}
              </div>
            )}

            <Textarea
              label="Remarks (optional)"
              rows={2}
              maxLength={1000}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />

            {/* Fixed square thumbnails rather than the full images. Proofs are
                phone screenshots - tall and narrow - and rendered full-width
                each one sat in a band of white taller than the rest of the
                form. Clicking one opens the real thing. */}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
                Payment Proof{isToken ? ' (optional)' : ''}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? [])
                  if (picked.length) setFiles((current) => [...current, ...picked])
                  // Cleared so picking the same file again still fires onChange.
                  event.target.value = ''
                }}
                className="hidden"
              />
              <div
                className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                  hasProof ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'
                }`}
              >
                {kept.map((url) => (
                  <ProofThumb
                    key={url}
                    href={`${MEDIA_BASE_URL}${url}`}
                    onRemove={() => setRemoved((current) => [...current, url])}
                  />
                ))}
                {files.map((picked, fileIndex) => (
                  <ProofThumb
                    key={filePreviews[fileIndex]}
                    href={filePreviews[fileIndex]}
                    title={picked.name}
                    isNew
                    onRemove={() => setFiles((current) => current.filter((_, i) => i !== fileIndex))}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 text-[11px] font-semibold text-brand-600 hover:border-brand-400 hover:bg-brand-50"
                >
                  <ImagePlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {hasProof ? 'Add more' : 'Upload images'}
                </button>
                {!hasProof && <p className="text-xs font-medium text-slate-500">No proof uploaded</p>}
              </div>
              {(files.length > 0 || removed.length > 0) && (
                <p className="mt-1 text-xs text-slate-500">
                  {files.length > 0 && `${files.length} new image${files.length === 1 ? '' : 's'}`}
                  {files.length > 0 && removed.length > 0 && ', '}
                  {removed.length > 0 && `${removed.length} to remove`} - saved with the payment.
                </p>
              )}
            </div>

            <ErrorMessage message={validationError ?? error} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              {entry && (
                <Button variant="secondary" onClick={cancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : entry ? 'Save changes' : isToken ? 'Save token' : 'Save payment'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// What the plan costs, what has come in and what is left - read before the
// cards, so nobody has to add up six of them to know where a student stands.
function PaymentTotals({ ledger }) {
  const items = [
    { label: 'Total Fee', value: ledger.fee, tone: 'text-slate-900' },
    { label: 'Received', value: ledger.received, tone: 'text-emerald-700' },
    { label: 'Due', value: ledger.due, tone: ledger.due > 0 ? 'text-amber-700' : 'text-emerald-700' },
  ]
  return (
    <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className={`truncate text-sm font-semibold ${item.tone}`}>{formatCurrency(item.value)}</p>
        </div>
      ))}
    </div>
  )
}

// What is still owed, when the student said it is coming, and anything said
// about it. Keyed on the stored values by its parent, so a payment that sets
// the date redraws it rather than leaving the old one in the box.
function BalancePanel({ ledger, onSave, isSaving, justSaved, error }) {
  const balance = ledger.balance?.entry
  const [dueAt, setDueAt] = useState(balance?.scheduled_at ?? '')
  const [remarks, setRemarks] = useState(balance?.remarks ?? '')

  if (!balance) {
    if (ledger.fee <= 0) return null
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Fully paid - {formatCurrency(ledger.received)} received
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const overdue = Boolean(balance.scheduled_at) && balance.scheduled_at < today
  const dirty = dueAt !== (balance.scheduled_at ?? '') || remarks.trim() !== (balance.remarks ?? '')

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Balance Due</p>
          <p className="text-lg font-semibold text-amber-800">{formatCurrency(ledger.due)}</p>
        </div>
        {overdue ? (
          <Badge tone="red">Overdue since {formatDate(balance.scheduled_at)}</Badge>
        ) : (
          !balance.scheduled_at && <Badge tone="amber">No date set</Badge>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[11rem_1fr]">
        <Input type="date" label="Next Payment Date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        <Input
          label="Remarks (optional)"
          maxLength={1000}
          placeholder="e.g. Will pay the rest after salary on the 5th"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
        />
      </div>
      <ErrorMessage message={error} />
      <div className="flex justify-end">
        <Button variant={justSaved ? 'success' : 'primary'} onClick={() => onSave({ dueAt, remarks })} disabled={isSaving || !dirty}>
          {isSaving ? (
            'Saving…'
          ) : justSaved ? (
            <>
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Saved
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  )
}

function PaymentCollectionSection({
  lead,
  onAssignPlan,
  isAssigningPlan,
  assignPlanError,
  onSavePayment,
  savingPaymentKey,
  savedPaymentKey,
  failedPayment,
  onSaveBalance,
  isSavingBalance,
  balanceError,
  onDeletePayment,
  deletingPaymentKey,
  failedDelete,
  paymentDeletions = 0,
}) {
  const ledger = getPaymentLedger(lead)
  // Payments not saved yet, by an id of their own. A lead with nothing
  // recorded opens on one; Add payment puts another beside it.
  const nextDraftId = useRef(1)
  const [drafts, setDrafts] = useState(() => (ledger.payments.length === 0 ? [0] : []))

  if (!lead.payment_plan) {
    return <PlanAssignmentForm onAssign={onAssignPlan} isAssigning={isAssigningPlan} error={assignPlanError} />
  }

  const owing = Boolean(ledger.balance)
  const balanceDueAt = ledger.balance?.entry.scheduled_at ?? null
  // A token is what comes before the payments, so once one is in it is no
  // longer offered - and nothing new is offered once nothing is owed.
  const tokenCard =
    ledger.token || (owing && ledger.payments.length === 0)
      ? { key: 'token', entry: ledger.token?.entry ?? null, index: ledger.token?.index ?? null }
      : null
  const paymentCards = [
    ...ledger.payments.map(({ entry, index }, n) => ({ key: `payment-${n + 1}`, entry, index, number: n + 1 })),
    ...(owing ? drafts : []).map((draftId, n) => ({
      key: `draft-${draftId}`,
      entry: null,
      index: null,
      number: ledger.payments.length + n + 1,
      draftId,
    })),
  ]

  function removeDraft(draftId) {
    setDrafts((current) => current.filter((id) => id !== draftId))
  }

  function save(card, kind, values) {
    onSavePayment(
      {
        cardKey: card.key,
        index: card.index,
        values: { ...values, kind },
        // Where it lands once saved: a new payment is the next one in the list.
        savedKey: card.entry ? card.key : kind === 'token' ? 'token' : `payment-${ledger.payments.length + 1}`,
      },
      card.draftId === undefined ? undefined : { onSuccess: () => removeDraft(card.draftId) },
    )
  }

  function cardProps(card, kind) {
    return {
      kind,
      entry: card.entry,
      due: ledger.due,
      balanceDueAt,
      onSave: (values) => save(card, kind, values),
      isSaving: savingPaymentKey === card.key,
      justSaved: savedPaymentKey === card.key,
      error: failedPayment?.cardKey === card.key ? failedPayment.message : null,
      ...(card.entry && onDeletePayment
        ? {
            onDelete: (reason) => onDeletePayment({ cardKey: card.key, index: card.index, reason }),
            isDeleting: deletingPaymentKey === card.key,
            deleteError: failedDelete?.cardKey === card.key ? failedDelete.message : null,
          }
        : {}),
    }
  }

  // A saved card's form is filled from its entry when it mounts, and its key
  // is its place in the list - so once one is deleted, the next one along
  // would take over its card with the deleted entry's figures still in the
  // form. Each delete gives the saved cards new keys, so they start afresh.
  // Drafts keep theirs: what is typed into one has nothing to do with it.
  const mountKey = (card) => (card.entry || card.key === 'token' ? `${card.key}@${paymentDeletions}` : card.key)

  return (
    // The same panel every other block on this tab uses.
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
      <div className="space-y-3">
        {lead.course_interest && (
          <p className="truncate text-sm font-semibold text-slate-900">{lead.course_interest}</p>
        )}
        <PaymentTotals ledger={ledger} />

        {tokenCard && <PaymentCard key={mountKey(tokenCard)} title="Token Amount" {...cardProps(tokenCard, 'token')} />}

        {/* Two across once there are several - each card is a short form, and
            stretched full width the fields looked lost - but one gets the
            whole width rather than half a row beside dead space. items-start:
            a saved summary beside an open form would otherwise stretch into a
            tall, mostly empty box. No max-height: the modal body is already
            the scroll container. */}
        {paymentCards.length > 0 && (
          <div className={`grid grid-cols-1 items-start gap-3 ${paymentCards.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {paymentCards.map((card) => (
              <PaymentCard
                key={mountKey(card)}
                title={`Payment ${card.number}`}
                number={card.number}
                // A draft can go as long as there is another card to fall back on.
                onRemove={card.draftId !== undefined && paymentCards.length > 1 ? () => removeDraft(card.draftId) : undefined}
                {...cardProps(card, 'payment')}
              />
            ))}
          </div>
        )}

        {owing && (
          <button
            type="button"
            onClick={() => setDrafts((current) => [...current, nextDraftId.current++])}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-600 hover:border-brand-400 hover:bg-brand-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Add payment
          </button>
        )}

        <BalancePanel
          key={`${ledger.balance?.entry.scheduled_at ?? ''}|${ledger.balance?.entry.remarks ?? ''}|${ledger.due}`}
          ledger={ledger}
          onSave={onSaveBalance}
          isSaving={isSavingBalance}
          justSaved={savedPaymentKey === 'balance'}
          error={balanceError}
        />
      </div>
    </DetailPanel>
  )
}

// Shown only on a lost lead: the one action that brings a student back.
//
// The course is asked for rather than assumed, and defaults to the one they
// left on - somebody returning months later often comes back to a different
// course, and it is the fact everything after this is worked from. Their
// payment history is untouched, which is why the panel says so: whoever is
// about to rejoin a part-paid student needs to know it isn't being wiped.
function RejoinPanel({ lead, onRejoin, isRejoining, error }) {
  const [course, setCourse] = useState(lead.course_interest ?? '')

  // Same catalog the board's Course cell offers (and the same query key, so
  // it's already in cache): every live course, plus anything already in the
  // data that is no longer offered - including the course this lead left on.
  const coursesQuery = useQuery({ queryKey: ['lead-course-catalog'], queryFn: leadService.getCourseCatalog })
  const courses = coursesQuery.data ?? []
  const options = course && !courses.includes(course) ? [course, ...courses] : courses

  return (
    <DetailPanel
      title="Rejoin"
      icon={RotateCcw}
      tone="emerald"
      action={
        lead.lost_at ? (
          <span className="text-[11px] font-medium text-slate-400">Quit on {formatDate(lead.lost_at)}</span>
        ) : null
      }
    >
      {lead.lost_reason && (
        <p className="mb-3 break-words text-sm text-slate-600">
          <span className="font-medium text-slate-500">Reason recorded:</span> {lead.lost_reason}
        </p>
      )}
      <ErrorMessage message={error} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Select
            label="Rejoining course"
            value={course}
            disabled={isRejoining}
            onChange={(event) => setCourse(event.target.value)}
          >
            <option value="">Select a course…</option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="success"
          className="shrink-0"
          disabled={!course || isRejoining}
          onClick={() => onRejoin(course)}
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {isRejoining ? 'Rejoining…' : 'Rejoin'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Puts this student back on the board at New Lead, on the course chosen above. Payments already
        recorded against them are kept.
      </p>
    </DetailPanel>
  )
}

function OverviewTab({
  lead,
  onSelectStage,
  isSaving,
  onRejoin,
  isRejoining,
  rejoinError,
  onAssignPlan,
  isAssigningPlan,
  assignPlanError,
  paymentProps,
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

      {lead.status === 'lost' && (
        <RejoinPanel lead={lead} onRejoin={onRejoin} isRejoining={isRejoining} error={rejoinError} />
      )}

      {/* Open at every stage, not only Follow up call: money turns up when it
          turns up, often before the lead has been moved on the board, and the
          person taking it shouldn't have to change the stage first to record
          it. Not on a quit student - the Rejoin panel above is what that
          popup is for, and their payment history stays on Payment Details. */}
      {lead.status !== 'lost' && (
        <PaymentCollectionSection
          lead={lead}
          onAssignPlan={onAssignPlan}
          isAssigningPlan={isAssigningPlan}
          assignPlanError={assignPlanError}
          {...paymentProps}
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

// A follow-up from this tab is a day, not an appointment: it is saved at the
// start of the calling day, which is when its reminder lands.
const FOLLOW_UP_TIME = '10:00'

function FollowUpTab({ day, setDay, remarks, setRemarks, history, onSave, isSaving, onClose }) {
  const today = toDateTimeInputValue(new Date()).slice(0, 10)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Schedule next follow-up</p>
          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
            <Calendar from={day} to={day} min={today} onPick={setDay} />
          </div>
          {/* What will be saved, in words. */}
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} aria-hidden="true" />
            {day ? (
              <span className="font-medium text-slate-900">
                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date(`${day}T00:00`))}
              </span>
            ) : (
              <span className="text-slate-500">Pick a day in the calendar</span>
            )}
          </p>
        </div>
        <Textarea
          label="Remarks (optional)"
          rows={8}
          maxLength={1000}
          placeholder="What is this follow-up for? e.g. Call back after salary, confirm the batch…"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onSave} disabled={isSaving || !day}>
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
                <p className="font-semibold text-slate-900">{formatDate(entry.scheduled_at)}</p>
                {entry.remarks && <p className="mt-0.5 break-words text-slate-700">{entry.remarks}</p>}
                <p className="mt-0.5 text-xs text-slate-500">Scheduled on {formatDateTime(entry.created_at)}</p>
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
        const { title, detail, reason } = describeTimelineEntry(entry)
        return (
          <li key={entry.id} className="flex gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACTION_TONES[entry.action] ?? 'bg-slate-100 text-slate-500'}`}>
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 border-b border-slate-100 pb-3">
              <p className="text-sm font-medium text-slate-900">{title}</p>
              <p className="text-xs text-slate-400">
                {detail ? `${detail} · ` : ''}
                {formatDateTime(entry.created_at)}
              </p>
              {reason && (
                <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                  <span className="font-medium text-slate-500">Reason:</span> {reason}
                </p>
              )}
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
  // The Follow-up tab's day and remarks. The day starts on the one already
  // booked, so saving just a remark keeps it.
  const [followUpDay, setFollowUpDay] = useState(toDateTimeInputValue(lead.follow_up_at).slice(0, 10))
  const [followUpRemarks, setFollowUpRemarks] = useState('')
  // Mirrors the lead prop but gets refreshed from each mutation's response,
  // so e.g. saving a payment shows it as paid, with the balance worked out
  // again, immediately instead of only after the modal is reopened.
  const [liveLead, setLiveLead] = useState(lead)
  // The payment card being saved, and the one just saved - see paymentMutation.
  const [savingPaymentKey, setSavingPaymentKey] = useState(null)
  const [savedPaymentKey, setSavedPaymentKey] = useState(null)
  // How many payments this popup has deleted - see PaymentCollectionSection's
  // mountKey. Admins only: the server answers who, from PAYMENT_DELETE_ROLES.
  const [paymentDeletions, setPaymentDeletions] = useState(0)
  const { user } = useAuth()
  const canDeletePayments = Boolean(user?.can_delete_payments)
  // A stage move that has to ask something first: why (Quit, or a move back to
  // an earlier stage), and/or when (Follow up call, which is a call booked for
  // a time). { status, kind: 'lost' | 'back' | 'followup', needsFollowUp }
  // while the prompt is open.
  const [pendingStage, setPendingStage] = useState(null)
  const [stageReason, setStageReason] = useState('')
  const [stageFollowUpAt, setStageFollowUpAt] = useState('')
  // The prompt opens below the stage buttons, and with a calendar in it most
  // of it lands under the fold - brought into view so it isn't missed.
  const pendingStageRef = useRef(null)
  useEffect(() => {
    if (pendingStage) pendingStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [pendingStage])

  function invalidateLeadQueries() {
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
    queryClient.invalidateQueries({ queryKey: ['lead-timeline', lead.id] })
    // A QR code typed in on a payment joins the list offered everywhere else.
    queryClient.invalidateQueries({ queryKey: ['lead-field-options', 'qr_code'] })
  }

  const stageMutation = useMutation({
    mutationFn: ({ status, lostReason, backReason, followUpAt: scheduledFor }) =>
      leadService.update(lead.id, {
        status,
        ...(lostReason ? { lost_reason: lostReason } : {}),
        ...(backReason ? { stage_change_reason: backReason } : {}),
        // Same field the Follow-up tab writes, in the same request as the
        // move, so a lead never sits in Follow up call with no call booked.
        ...(scheduledFor ? { follow_up_at: new Date(scheduledFor).toISOString() } : {}),
      }),
    onSuccess: () => {
      invalidateLeadQueries()
      onClose()
    },
  })

  // Moving to Quit, or back to an earlier stage, needs a reason (the server
  // rejects either without one), so those route through a prompt instead of
  // firing immediately. The reason for a move back lands on the timeline.
  //
  // Moving into Follow up call asks when the call is, whichever direction it
  // comes from - a move back to it asks both why and when.
  function selectStage(newStatus) {
    const needsFollowUp = newStatus === 'pre_screening' && liveLead.status !== 'pre_screening'
    if (newStatus === 'lost') {
      setPendingStage({ status: 'lost', kind: 'lost' })
      return
    }
    if (isStageReversal(liveLead.status, newStatus)) {
      setPendingStage({ status: newStatus, kind: 'back', needsFollowUp })
      return
    }
    if (needsFollowUp) {
      setPendingStage({ status: newStatus, kind: 'followup', needsFollowUp })
      return
    }
    stageMutation.mutate({ status: newStatus })
  }

  function cancelPendingStage() {
    setPendingStage(null)
    setStageReason('')
    setStageFollowUpAt('')
  }

  function confirmPendingStage() {
    const reason = stageReason.trim()
    const followUp = pendingStage.needsFollowUp ? { followUpAt: stageFollowUpAt } : {}
    stageMutation.mutate(
      pendingStage.kind === 'lost'
        ? { status: 'lost', lostReason: reason }
        : pendingStage.kind === 'back'
          ? { status: pendingStage.status, backReason: reason, ...followUp }
          : { status: pendingStage.status, ...followUp },
    )
  }

  const pendingNeedsReason = pendingStage?.kind === 'lost' || pendingStage?.kind === 'back'
  // A call booked for a time already gone is a reminder that fires the moment
  // it is saved - refused here rather than stored.
  const followUpInPast = Boolean(stageFollowUpAt) && !isFutureDateTime(stageFollowUpAt)
  const canConfirmPendingStage =
    Boolean(pendingStage) &&
    (!pendingNeedsReason || Boolean(stageReason.trim())) &&
    (!pendingStage.needsFollowUp || (Boolean(stageFollowUpAt) && !followUpInPast))

  // Stays open on success, unlike a stage change: the lead is back on the
  // board and the popup redraws as the active lead it now is - which is the
  // confirmation that it worked.
  const rejoinMutation = useMutation({
    mutationFn: (courseInterest) => leadService.rejoin(lead.id, courseInterest),
    onSuccess: (updatedLead) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
    },
  })

  const followUpMutation = useMutation({
    mutationFn: () =>
      leadService.update(lead.id, {
        follow_up_at: new Date(`${followUpDay}T${FOLLOW_UP_TIME}`).toISOString(),
        follow_up_remarks: followUpRemarks.trim() || null,
      }),
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

  // A token or payment, new or corrected. `cardKey` is the card that asked,
  // so its own spinner and error show on it; `savedKey` is where the saved
  // entry lands, which for a new one is a card that doesn't exist yet.
  const paymentMutation = useMutation({
    mutationFn: ({ index, values }) => leadService.recordPayment(lead.id, index, values),
    // Keyed off onSuccess, not onSettled: onSettled also fires on failure, and
    // a card that says "Saved" after the request errored is worse than one
    // that says nothing.
    onSuccess: (updatedLead, { savedKey }) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
      setSavedPaymentKey(savedKey)
    },
    onSettled: () => setSavingPaymentKey(null),
  })

  const balanceMutation = useMutation({
    mutationFn: (values) => leadService.updateBalance(lead.id, values),
    onSuccess: (updatedLead) => {
      setLiveLead(updatedLead)
      invalidateLeadQueries()
      setSavedPaymentKey('balance')
    },
  })

  // A token or payment recorded by mistake, taken off. The new lead and the
  // new card keys are set together, so the cards never draw once with the
  // list shifted under the old keys.
  const deletePaymentMutation = useMutation({
    mutationFn: ({ index, reason }) => leadService.deletePayment(lead.id, index, reason),
    onSuccess: (updatedLead) => {
      setLiveLead(updatedLead)
      setPaymentDeletions((count) => count + 1)
      invalidateLeadQueries()
      // The Finance board's lists and the Statistics Finance tab read the
      // same payments.
      queryClient.invalidateQueries({ queryKey: ['income-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['statistics', 'finance'] })
    },
  })

  // Clears the "Saved" confirmation after a beat so the card settles back to
  // its real state rather than claiming to be a save receipt forever.
  useEffect(() => {
    if (savedPaymentKey === null) return undefined
    const timer = setTimeout(() => setSavedPaymentKey(null), 2500)
    return () => clearTimeout(timer)
  }, [savedPaymentKey])

  const paymentProps = {
    onSavePayment: (variables, options) => {
      setSavingPaymentKey(variables.cardKey)
      paymentMutation.mutate(variables, options)
    },
    savingPaymentKey,
    savedPaymentKey,
    failedPayment: paymentMutation.isError
      ? { cardKey: paymentMutation.variables?.cardKey, message: getApiErrorMessage(paymentMutation.error) }
      : null,
    onSaveBalance: (values) => balanceMutation.mutate(values),
    isSavingBalance: balanceMutation.isPending,
    balanceError: balanceMutation.error ? getApiErrorMessage(balanceMutation.error) : null,
    onDeletePayment: canDeletePayments ? (variables) => deletePaymentMutation.mutate(variables) : undefined,
    deletingPaymentKey: deletePaymentMutation.isPending ? deletePaymentMutation.variables?.cardKey : null,
    failedDelete: deletePaymentMutation.isError
      ? { cardKey: deletePaymentMutation.variables?.cardKey, message: getApiErrorMessage(deletePaymentMutation.error) }
      : null,
    paymentDeletions,
  }

  // Payment errors show on the card that raised them rather than up here.
  const activeError = stageMutation.error || followUpMutation.error
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
            onRejoin={(courseInterest) => rejoinMutation.mutate(courseInterest)}
            isRejoining={rejoinMutation.isPending}
            rejoinError={rejoinMutation.error ? getApiErrorMessage(rejoinMutation.error) : null}
            onAssignPlan={(values) => planMutation.mutate(values)}
            isAssigningPlan={planMutation.isPending}
            assignPlanError={planMutation.error ? getApiErrorMessage(planMutation.error) : null}
            paymentProps={paymentProps}
          />
        )}
        {activeTab === 'induction' && <InductionTab leadId={lead.id} />}
        {activeTab === 'payment' && <PaymentDetailsTab lead={liveLead} />}
        {activeTab === 'followup' && (
          <FollowUpTab
            day={followUpDay}
            setDay={setFollowUpDay}
            remarks={followUpRemarks}
            setRemarks={setFollowUpRemarks}
            history={liveLead.follow_up_history ?? []}
            onSave={() => followUpMutation.mutate()}
            isSaving={followUpMutation.isPending}
            onClose={onClose}
          />
        )}
        {activeTab === 'timeline' && <TimelineTab leadId={lead.id} />}

        {pendingStage && (
          <div
            ref={pendingStageRef}
            className={`rounded-lg border p-4 ${
              pendingStage.kind === 'lost'
                ? 'border-red-200 bg-red-50'
                : pendingStage.kind === 'back'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-brand-200 bg-brand-50/60'
            }`}
          >
            <ErrorMessage message={stageMutation.error ? getApiErrorMessage(stageMutation.error) : null} />
            {pendingNeedsReason && (
              <>
                <p
                  className={`mb-2 text-sm font-semibold ${
                    pendingStage.kind === 'lost' ? 'text-red-700' : 'text-amber-800'
                  }`}
                >
                  {pendingStage.kind === 'lost'
                    ? 'Why is this lead being marked Quit?'
                    : `Why is this lead moving back to ${stageLabel(pendingStage.status)}?`}
                </p>
                <Input
                  autoFocus
                  maxLength={500}
                  placeholder={
                    pendingStage.kind === 'lost'
                      ? 'e.g. Joined elsewhere, not interested, unreachable…'
                      : 'e.g. Payment not received yet, student asked to call later…'
                  }
                  value={stageReason}
                  onChange={(event) => setStageReason(event.target.value)}
                />
                {pendingStage.kind === 'back' && (
                  <p className="mt-1.5 text-xs text-amber-700">Shown on the lead&rsquo;s timeline with the move.</p>
                )}
              </>
            )}
            {pendingStage.needsFollowUp && (
              <div className={pendingNeedsReason ? 'mt-4' : ''}>
                <p className="mb-2 text-sm font-semibold text-brand-800">When is the student available?</p>
                <DateTimePicker label="Available on" value={stageFollowUpAt} onChange={setStageFollowUpAt} />
                {followUpInPast && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">That time has already passed - pick a later one.</p>
                )}
                <p className="mt-1.5 text-xs text-slate-500">
                  Shown in the board&rsquo;s Follow-up column, and a reminder goes out when it comes round.
                </p>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelPendingStage}>
                Cancel
              </Button>
              <Button
                variant={pendingStage.kind === 'lost' ? 'danger' : 'primary'}
                disabled={!canConfirmPendingStage || stageMutation.isPending}
                onClick={confirmPendingStage}
              >
                {stageMutation.isPending
                  ? 'Saving…'
                  : pendingStage.kind === 'lost'
                    ? 'Mark Quit'
                    : pendingStage.kind === 'back'
                      ? `Move back to ${stageLabel(pendingStage.status)}`
                      : `Move to ${stageLabel(pendingStage.status)}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
