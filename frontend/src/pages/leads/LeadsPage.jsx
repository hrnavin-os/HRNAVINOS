import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { foundationFormService } from '@/services/foundationFormService'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { LEAD_STAGES, LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { PERMISSIONS } from '@/constants/permissions'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Toast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable'
import { TableCard } from '@/components/ui/TableCard'
import { DatePresetFilter } from '@/components/ui/DatePresetFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { Pagination } from '@/components/ui/Pagination'
import { SortOrderSelect } from '@/components/ui/SortOrderSelect'
import { LeadSectionStageStats, LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { LeadCourseCell } from '@/components/leads/LeadCourseCell'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import { CreateLeadModal } from '@/components/leads/CreateLeadModal'
import { LeadRemarksCell } from '@/components/leads/LeadRemarksCell'
import { LeadGroupCell } from '@/components/leads/FoundationGroupCell'
import { InductionLeadsBoard } from '@/components/leads/InductionLeadsBoard'
import { RowActions } from '@/components/resource/RowActions'
import { ConfirmDeleteModal } from '@/components/resource/ConfirmDeleteModal'
import { useLeadBoard } from '@/hooks/useLeadBoard'
import {
  PAYMENT_PLAN_TONES,
  CALL_REMARK_OPTIONS,
  CALL_REMARK_BY_VALUE,
  QR_CODE_OPTIONS,
} from '@/constants/paymentOptions'
import { PAYMENT_PLAN_LABELS } from '@/constants/installmentPaymentModes'
import { FOUNDATION_GROUP_LABELS, FOUNDATION_GROUP_OPTIONS } from '@/constants/foundationGroups'
import { anchorPopup } from '@/utils/anchorPopup'

// Anchors a portaled popup under its trigger, clamped so it never runs off
// the right edge of the viewport (a trigger in the table's rightmost column,
// Remarks, would otherwise push it past screen bounds). Flips above the
// trigger when there isn't `popupHeight` of room below it, so a row at the
// bottom of a full table doesn't open a menu cut off by the screen edge.
function popupPositionFor(rect, popupWidth, popupHeight = 288) {
  return anchorPopup(rect, popupWidth, popupHeight)
}

// Splits text into lines of at most `n` words each, so a long query wraps
// predictably instead of running the popup wide.
function wrapEveryNWords(text, n) {
  const words = text.split(/\s+/)
  const lines = []
  for (let i = 0; i < words.length; i += n) {
    lines.push(words.slice(i, i + n).join(' '))
  }
  return lines
}

const EXCLUDED_COURSE_OPTIONS = ['HR Recruitment', 'Nothing']

// A brighter, more differentiated palette for this table's Stage column
// specifically - independent of each stage's shared `tone` name, which the
// stat cards and the Lead Detail modal's stage-picker buttons key their own
// (different) color maps off of, so changing it here can't affect them.
// Every stage is a solid fill with white text, so the column reads as one
// consistent set rather than one filled chip among pale ones.
//
// Solid fills, not gradients. Each one is the gradient's old `from` stop, which
// is the end the contrast was measured against - so the pills keep exactly the
// ratios below and only lose the darkening toward their right edge.
//
// The step numbers differ per hue on purpose. White text has to stay legible on
// each, and the hues are not equally light at the same step. Matching blue's
// 500 numerically would put white on yellow-500 at 1.92:1 and green-500 at
// 2.28:1, effectively unreadable. These steps were chosen so every fill clears
// 4.5:1 (blue 5.17, red 4.83, yellow 4.92, purple 5.38, green 5.02, orange
// 5.18) - matched by perceived lightness, not by step number. Re-check the
// contrast if you retune these.
const STAGE_CELL_STYLES = {
  new_lead: 'bg-blue-600 text-white',
  rnr: 'bg-red-600 text-white',
  pre_screening: 'bg-yellow-700 text-white',
  financial_approval: 'bg-purple-600 text-white',
  batch_confirmation: 'bg-green-700 text-white',
  lost: 'bg-orange-700 text-white',
}

// Shows just the first 6 characters + "…" so a long query doesn't blow out
// the row height; hovering reveals the full text in a floating popup.
// Portaled to <body> (positioned from the trigger's own bounding rect)
// rather than rendered inline, because DataTable wraps rows in an
// overflow-x-auto container that would otherwise clip it.
function TruncatedText({ text }) {
  const triggerRef = useRef(null)
  const [popupPosition, setPopupPosition] = useState(null)

  if (!text) return <span className="text-slate-400">—</span>
  const trimmed = text.trim()
  if (trimmed.length <= 6) return <span>{trimmed}</span>

  function show() {
    const rect = triggerRef.current.getBoundingClientRect()
    setPopupPosition(popupPositionFor(rect, 200, 160))
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setPopupPosition(null)}
        className="inline-block cursor-default border-b border-dotted border-slate-300"
      >
        {trimmed.slice(0, 6)}…
      </span>
      {popupPosition &&
        createPortal(
          <div
            style={{ top: popupPosition.top, bottom: popupPosition.bottom, left: popupPosition.left }}
            className="pointer-events-none fixed z-100 w-50 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal text-slate-700 shadow-lg"
          >
            {wrapEveryNWords(trimmed, 4).map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// Inline-editable colored-tag cell - shows the lead's current value as a
// Badge (or a muted placeholder if unset); clicking it opens a portaled
// menu of every option, each previewed as its own colored Badge, matching
// the Google Sheets dropdown this replaces. Used for both Payment Option
// and Payment Call Remarks, which only differ by field name and options.
//
// `displayByValue` is looked up before `options` so a value that's been
// retired from the picker still renders its own label instead of falling
// back to the "Select…" placeholder, which would read as empty data.
// The amount someone actually paid, typed straight into the row.
//
// Not derived from the installments: this is the manual pair beside Payment
// Remarks, filled in while a lead is still being chased on the phone and
// before any structured collection has happened.
//
// Reads as text until you click it, so a column of amounts stays a column of
// amounts rather than a wall of input boxes.
function AmountCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(lead.paying_amount ?? '')

  const mutation = useMutation({
    // Empty clears the field rather than sending "", which the decimal column
    // would reject.
    mutationFn: () => leadService.update(lead.id, { paying_amount: value === '' ? null : Number(value) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setIsEditing(false)
    },
    onError: (error) => onError(`Couldn't save the amount for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  function open(event) {
    event.stopPropagation()
    setValue(lead.paying_amount ?? '')
    mutation.reset()
    setIsEditing(true)
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={open}
        className="w-full rounded-md px-2 py-1 text-sm tabular-nums transition-colors hover:bg-slate-100"
      >
        {lead.paying_amount === null || lead.paying_amount === undefined ? (
          <span className="text-slate-400">Add amount</span>
        ) : (
          <span className="font-medium text-slate-900">{formatCurrency(lead.paying_amount)}</span>
        )}
      </button>
    )
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') mutation.mutate()
        if (event.key === 'Escape') setIsEditing(false)
      }}
    >
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="0"
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        aria-label="Save amount"
        className="rounded p-1 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={mutation.isPending}
        aria-label="Cancel"
        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
      >
        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  )
}

// The batch the student is in. For a lead that came through Induction it is
// the number entered on the Induction form and can't be changed here - that
// form is the one source. Otherwise it is typed straight into the row (e.g.
// "27"), the same `batch_number` Batch Confirmation writes. Reads as text
// until clicked, like AmountCell.
function BatchCell({ lead, onError }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(lead.batch_number ?? '')

  const mutation = useMutation({
    mutationFn: () => leadService.update(lead.id, { batch_number: value.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      setIsEditing(false)
    },
    onError: (error) => onError(`Couldn't save the batch for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  function open(event) {
    event.stopPropagation()
    setValue(lead.batch_number ?? '')
    mutation.reset()
    setIsEditing(true)
  }

  if (lead.induction_batch) {
    return (
      <span title="Set on the Induction form">
        <Badge tone="blue">{lead.induction_batch}</Badge>
      </span>
    )
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={open}
        className="w-full rounded-md px-2 py-1 text-sm transition-colors hover:bg-slate-100"
      >
        {lead.batch ? (
          <span className="font-medium text-slate-900">{lead.batch}</span>
        ) : (
          <span className="text-slate-400">Add batch</span>
        )}
      </button>
    )
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') mutation.mutate()
        if (event.key === 'Escape') setIsEditing(false)
      }}
    >
      <input
        autoFocus
        type="text"
        maxLength={50}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Batch"
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        aria-label="Save batch"
        className="rounded p-1 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={mutation.isPending}
        aria-label="Cancel"
        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
      >
        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  )
}

// Past this many options the menu grows a search box. Seven payment remarks
// are quicker to read than to filter; thirty QR accounts are not.
const SEARCHABLE_FROM = 10

// `allowAdd` lets a value the list doesn't have be typed in and saved, so a
// new QR account or a new kind of payment remark doesn't need a release. What
// was typed shows as it was stored.
function SelectBadgeCell({ lead, field, options, displayByValue, placeholder, onError, plain = false, allowAdd = false }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)
  const [query, setQuery] = useState('')
  const stored = lead[field]
  const current =
    displayByValue?.[stored] ??
    options.find((option) => option.value === stored) ??
    (stored ? { value: stored, label: stored, tone: 'slate' } : undefined)

  // Always there when adding is allowed - the box is where a new one is typed.
  const searchable = allowAdd || options.length >= SEARCHABLE_FROM
  const needle = query.trim().toLowerCase()
  const shown = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options
  // Offered once the typed text isn't already one of the options, whatever
  // its case - "sneha" should pick Sneha, not add a second one.
  const typed = query.trim().slice(0, 100)
  const lowered = typed.toLowerCase()
  const addable =
    allowAdd &&
    typed &&
    !options.some((option) => option.label.toLowerCase() === lowered || option.value.toLowerCase() === lowered)
      ? typed
      : null

  const mutation = useMutation({
    mutationFn: (value) => leadService.update(lead.id, { [field]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      if (allowAdd) queryClient.invalidateQueries({ queryKey: ['lead-field-options', field] })
    },
    onError: (error) => onError(`Couldn't update ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  function toggle(event) {
    event.stopPropagation()
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    // Reopening always starts from the whole list rather than the last filter,
    // which would otherwise hide most of it with no sign why.
    setQuery('')
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPosition(popupPositionFor(rect, 256))
  }

  // Portal clicks bubble through the component tree rather than the DOM one,
  // so the backdrop has to stop the event from reaching the row behind it.
  function close(event) {
    event?.stopPropagation()
    setMenuPosition(null)
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-full px-1 py-1 hover:bg-slate-50 ${
          current ? '' : 'w-full min-w-36 justify-between border border-slate-200 bg-slate-50 px-3 py-1.5 hover:bg-slate-100'
        }`}
      >
        {current ? (
          plain ? (
            <span className="truncate text-sm text-slate-900">{current.label}</span>
          ) : (
            <Badge tone={current.tone}>{current.label}</Badge>
          )
        ) : (
          <span className="text-sm text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      </button>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left }}
              onClick={(event) => event.stopPropagation()}
              className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
            >
              {searchable && (
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={allowAdd ? 'Search or add new…' : 'Search…'}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    const pick = shown.length === 1 ? shown[0].value : addable
                    if (!pick) return
                    mutation.mutate(pick)
                    close(event)
                  }}
                  className="mb-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
              {/* Clears the field back to unset - without it a value picked
                  by mistake could never be taken off the lead again. */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  mutation.mutate(null)
                  close()
                }}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                  stored ? 'text-slate-500 hover:bg-slate-50' : 'bg-slate-50 font-medium text-slate-600'
                }`}
              >
                {placeholder}
              </button>
              {shown.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    mutation.mutate(option.value)
                    close()
                  }}
                  className={`block w-full rounded px-1 py-1 text-left hover:bg-slate-50 ${
                    stored === option.value ? 'bg-slate-50' : ''
                  }`}
                >
                  {plain ? (
                    <span className="block truncate px-1 text-sm text-slate-700">{option.label}</span>
                  ) : (
                    <Badge tone={option.tone}>{option.label}</Badge>
                  )}
                </button>
              ))}
              {addable && (
                <button
                  type="button"
                  onClick={(event) => {
                    mutation.mutate(addable)
                    close(event)
                  }}
                  className="mt-1 flex w-full items-center gap-1.5 rounded border-t border-slate-100 px-2 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  <span className="truncate">
                    Add “<span className="font-medium">{addable}</span>”
                  </span>
                </button>
              )}
              {searchable && !shown.length && !addable && (
                <p className="px-2 py-3 text-center text-sm text-slate-400">No match for “{query}”.</p>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

function useFieldOptions(field) {
  const query = useQuery({ queryKey: ['lead-field-options', field], queryFn: () => leadService.getFieldOptions(field) })
  return query.data ?? []
}

// The built-in options first, in their own order, then whatever has been added
// on leads - skipping anything that is only a built-in one in another case.
function withAddedOptions(builtIn, added) {
  const known = new Set(builtIn.flatMap((option) => [option.value.toLowerCase(), option.label.toLowerCase()]))
  return [
    ...builtIn,
    ...added
      .filter((value) => !known.has(value.toLowerCase()))
      .map((value) => ({ value, label: value, tone: 'slate' })),
  ]
}

// Anything already recorded against the current plan's installments. Changing
// the plan rebuilds them from the price list, so this is what would be lost.
function hasCollectedPayments(lead) {
  return (lead.installments ?? []).some(
    (installment) =>
      installment.paid ||
      installment.proof_url ||
      installment.transaction_id ||
      installment.upi_id ||
      installment.mode ||
      installment.scheduled_at,
  )
}

/**
 * The lead's payment plan, changed from the table.
 *
 * Goes through the same assign-plan call the detail modal uses rather than
 * writing the field directly: the plan is what the installment schedule is
 * built from, so the two have to be set together or the row would claim a plan
 * whose amounts belong to a different one.
 *
 * That rebuild is also why a plan with money already recorded against it asks
 * first - amounts, proofs and dates on the old schedule don't survive it.
 *
 * Only the plans this lead's program actually offers are listed, since the
 * price list is per category and the API rejects the rest anyway. A lead with
 * no program yet has nothing to price a plan from, so it stays read-only here
 * and is set in the detail modal, which asks for the program too.
 */
function PaymentPlanCell({ lead, pricing, onError }) {
  const queryClient = useQueryClient()
  const buttonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)

  const program = pricing?.programs.find((option) => option.value === lead.program_interest)
  const category = program ? pricing.categories[program.category] : null
  const options = (category?.plans ?? []).map((plan) => ({
    value: plan.value,
    // The board's own short labels, not the price list's sentence-long ones,
    // so the column reads the same as every other surface naming a plan.
    label: PAYMENT_PLAN_LABELS[plan.value] ?? plan.label,
    summary: plan.summary,
    tone: PAYMENT_PLAN_TONES[plan.value] ?? 'slate',
  }))

  const mutation = useMutation({
    mutationFn: (paymentPlan) =>
      leadService.assignPlan(lead.id, { programInterest: lead.program_interest, paymentPlan }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (error) =>
      onError(`Couldn't change the payment method for ${lead.name}: ${getApiErrorMessage(error)}`),
  })

  const currentBadge = lead.payment_plan ? (
    <Badge tone={PAYMENT_PLAN_TONES[lead.payment_plan] ?? 'slate'}>
      {PAYMENT_PLAN_LABELS[lead.payment_plan] ?? titleCase(lead.payment_plan)}
    </Badge>
  ) : null

  // No program, or one retired from the price list: the row click still opens
  // the detail modal, which is where both are chosen together.
  if (!options.length) {
    return (
      <span title="Set this lead's program in their detail view to pick a payment method">
        {currentBadge ?? <span className="text-sm text-slate-400">—</span>}
      </span>
    )
  }

  function toggle(event) {
    event.stopPropagation()
    if (menuPosition) {
      setMenuPosition(null)
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    setMenuPosition(popupPositionFor(rect, 256))
  }

  // Portal clicks bubble through the component tree rather than the DOM one,
  // so the backdrop has to stop the event from reaching the row behind it.
  function close(event) {
    event?.stopPropagation()
    setMenuPosition(null)
  }

  function choose(event, value) {
    event.stopPropagation()
    close(event)
    if (value === lead.payment_plan) return
    if (
      hasCollectedPayments(lead) &&
      !window.confirm(
        `Change ${lead.name}'s payment method to "${PAYMENT_PLAN_LABELS[value] ?? value}"?\n\n` +
          'The installment schedule is rebuilt from the price list, so amounts, proofs, ' +
          'modes and dates already recorded against the current plan will be lost.',
      )
    ) {
      return
    }
    mutation.mutate(value)
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={mutation.isPending}
        className={`flex items-center gap-1.5 rounded-full px-1 py-1 hover:bg-slate-50 disabled:opacity-60 ${
          lead.payment_plan
            ? ''
            : 'w-full min-w-36 justify-between border border-slate-200 bg-slate-50 px-3 py-1.5 hover:bg-slate-100'
        }`}
      >
        {currentBadge ?? <span className="text-sm text-slate-400">Select…</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      </button>
      {menuPosition &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ top: menuPosition.top, bottom: menuPosition.bottom, left: menuPosition.left }}
              onClick={(event) => event.stopPropagation()}
              className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
            >
              {/* No "clear" here, unlike the other select cells: a lead with a
                  schedule but no plan is a row nothing can price. */}
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={(event) => choose(event, option.value)}
                  className={`block w-full rounded px-1 py-1 text-left hover:bg-slate-50 ${
                    lead.payment_plan === option.value ? 'bg-slate-50' : ''
                  }`}
                >
                  <Badge tone={option.tone}>{option.label}</Badge>
                  {/* What the plan costs, so the choice isn't made on its name
                      alone - the same summary the public form shows. */}
                  <span className="mt-0.5 block px-1 text-xs text-slate-500">{option.summary}</span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

// The two boards read different collections - induction submissions are their
// own records, not Leads - so they're separate components rather than one
// table with a filter. Splitting here also means the Foundation board's
// queries don't run while you're looking at the Induction one.
//
// The switch itself lives in the Topbar (components/layout/LeadBoardTabs) and
// drives a ?board= query param, which is what this reads. That keeps the
// control in the header without either component owning the other's state.
export function LeadsPage() {
  const [board] = useLeadBoard()

  return board === 'induction' ? <InductionLeadsBoard /> : <FoundationLeadsBoard />
}

// Everything that was previously the whole page: the stat cards, filters and
// lead table, all reading Lead records that arrive through the Foundation
// form. Moved behind a tab with no changes to what it renders.
function FoundationLeadsBoard() {
  const { user, hasPermission } = useAuth()
  const canCreateLead = hasPermission(PERMISSIONS.LEADS_CREATE)
  const canDeleteLead = hasPermission(PERMISSIONS.LEADS_DELETE)
  const queryClient = useQueryClient()

  // Which lead the confirmation step is open for. Deleting is behind it for
  // the same reason it is everywhere else in the ERP: the trash icon sits in a
  // row you can also click to open, and one stray click must not remove
  // somebody's record.
  const [deletingLead, setDeletingLead] = useState(null)
  const deleteMutation = useMutation({
    mutationFn: (id) => leadService.remove(id),
    onSuccess: () => {
      // The stat cards count the same leads, so they go stale with the table.
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
      setDeletingLead(null)
    },
  })

  // Section Admins are permanently locked to their own section - the role
  // itself carries this, not a UI selection, so it can never be navigated
  // away from. Admin/Super Admin have no scoped_section and keep the same
  // unrestricted board regardless of which tab they click.
  const scopedSection = user?.scoped_section || null

  const [viewingLead, setViewingLead] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  // ?lead=<id> opens that candidate straight away - how a due-date reminder in
  // the notification panel gets you to the person it's about. Fetched by id
  // rather than looked up in `items`, because the lead being chased is very
  // often not on the page of results you happen to be showing.
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkedLeadId = searchParams.get('lead')

  const deepLinkedQuery = useQuery({
    queryKey: ['lead', deepLinkedLeadId],
    queryFn: () => leadService.get(deepLinkedLeadId),
    enabled: Boolean(deepLinkedLeadId),
  })

  // Dropping the param on close stops the modal reopening itself on every
  // later render, and keeps the URL honest about what's on screen.
  function closeLead() {
    setViewingLead(null)
    if (deepLinkedLeadId) {
      const next = new URLSearchParams(searchParams)
      next.delete('lead')
      setSearchParams(next, { replace: true })
    }
  }

  // The row click still wins: if you opened someone else while a deep link was
  // in the URL, you get who you clicked.
  const openLead = viewingLead ?? (deepLinkedLeadId ? deepLinkedQuery.data : null)
  // Inline cell edits have no form to hang an error on, so failures surface
  // here instead of the cell silently reverting as if nothing happened.
  const [editError, setEditError] = useState(null)
  const [sectionFilter, setSectionFilter] = useState('')
  // The "Quit Students" tab: every lost lead on the board, across sections.
  // Its own state rather than the Stage filter set to Lost, so leaving it (a
  // section card, All Leads) doesn't leave a Stage filter behind.
  const [showLost, setShowLost] = useState(false)
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // The two payment columns, filterable because "who is on EMI" and "who said
  // they'd pay and hasn't" are the two questions the board is worked from.
  const [planFilter, setPlanFilter] = useState('')
  const [callRemarkFilter, setCallRemarkFilter] = useState('')
  // Which QR account the money went into - how a payment is reconciled
  // against one account's statement.
  const [qrCodeFilter, setQrCodeFilter] = useState('')
  // Which of the month's two foundation classes a lead came through - read off
  // the day their Foundation Form landed, which is the Date column beside it.
  const [groupFilter, setGroupFilter] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  // `{ from, to, preset }` or null - the same shape the Induction board uses.
  const [dateRange, setDateRange] = useState(null)

  // A Section Admin's section always wins over (and preempts) any tab
  // selection - for Admin/Super Admin this is just whichever tab is active.
  const effectiveSectionFilter = scopedSection || sectionFilter

  // Sections are admin-managed and open-ended (see Form Collection's "Add
  // Form"), so the top stat cards and Section badge read live from config
  // rather than a fixed list.
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sectionOptions = configQuery.data?.sections ?? []
  const sectionByCode = Object.fromEntries(sectionOptions.map((section) => [section.code, section]))

  // The price list behind the Payment Method column: which plans a lead's
  // program offers, and what each costs. Fetched once for the board rather
  // than per row, under the key the detail modal and the public form already
  // share.
  const pricingQuery = useQuery({ queryKey: ['foundation-form-pricing'], queryFn: foundationFormService.getPricing })

  // What the Group cell offers. Read from the Induction Call Form's own
  // config, which is where the list of classes is maintained, so a fourth
  // group added in Admin > Form Collection can be picked here too - a lead
  // and the induction entry behind it must not disagree about which groups
  // exist. The three defaults stand in while the config is loading.
  const inductionConfigQuery = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: inductionFormConfigService.get,
  })
  const configuredGroups =
    (inductionConfigQuery.data?.fields ?? []).find((field) => field.key === 'group')?.options ?? []
  const groupOptions = configuredGroups.length ? configuredGroups : FOUNDATION_GROUP_LABELS

  // The QR-Code and Payment Remarks menus: the built-in options, plus any
  // value somebody has added on a lead since, so one added once is offered on
  // every row (and in the filter).
  const qrCodeOptions = withAddedOptions(QR_CODE_OPTIONS, useFieldOptions('qr_code'))
  const callRemarkOptions = withAddedOptions(CALL_REMARK_OPTIONS, useFieldOptions('payment_call_remarks'))

  const courseOptionsQuery = useQuery({ queryKey: ['lead-course-options'], queryFn: leadService.getCourseOptions })
  // Everything the Course cell can offer, which is more than the filter's
  // list: a course nobody is on yet is a dead end to filter by and the point
  // of being able to set one.
  const courseCatalogQuery = useQuery({ queryKey: ['lead-course-catalog'], queryFn: leadService.getCourseCatalog })
  // Junk values from test leads created outside the real Foundation Form
  // programs - not real courses, so they don't belong in the filter list.
  const courseOptions = (courseOptionsQuery.data ?? []).filter(
    (course) => !EXCLUDED_COURSE_OPTIONS.includes(course),
  )

  // The filter row, shared by the table and the stat cards so a filter moves
  // both. Stage, section and the Lost tab are added per consumer below.
  const boardFilters = {
    course_interest: courseFilter || undefined,
    payment_plan: planFilter || undefined,
    payment_call_remarks: callRemarkFilter || undefined,
    qr_code: qrCodeFilter || undefined,
    foundation_group: groupFilter || undefined,
    date_from: dateRange?.from || undefined,
    date_to: dateRange?.to || undefined,
  }

  // `total` from the stat cards counts every section (and every stage, for a
  // Section Admin); this one is how many rows the table actually matched,
  // which is what the footer should report.
  const {
    items, page, setPage, search, setSearch, isLoading, error, totalPages,
    total: filteredTotal,
    pageSize,
  } = usePaginatedQuery('leads', leadService, {
    ...boardFilters,
    section: effectiveSectionFilter || undefined,
    status: showLost ? 'lost' : statusFilter || undefined,
    sort_order: sortOrder,
  })

  // Scoped to the user's own section for a Section Admin (so this becomes
  // that section's stage breakdown), but NOT to whichever tab an Admin/Super
  // Admin happens to have selected - their stat row always shows every
  // section's count, tab selection only filters the table beneath it. The
  // backend clears by_section whenever a section is passed in, so passing the
  // tab selection here would zero out the other cards. The Lost tab is left
  // out for the same reason.
  //
  // Every other filter does narrow the cards. Stage too, for an Admin; not for
  // a Section Admin, whose cards *are* the stages and would all but one read 0.
  const statsFilters = {
    ...boardFilters,
    status: scopedSection ? undefined : statusFilter || undefined,
    search: search || undefined,
  }
  const statsQuery = useQuery({
    queryKey: ['leads-stats', scopedSection, statsFilters],
    queryFn: () => leadService.getStats(scopedSection || undefined, statsFilters),
    // Keeps the last numbers up while a new filter's counts load, rather than
    // every card dropping to 0 and back.
    placeholderData: (previousData) => previousData,
  })
  const total = statsQuery.data?.total ?? 0
  const bySection = statsQuery.data?.by_section ?? {}
  const byStatus = statsQuery.data?.by_status ?? {}

  function selectSection(code) {
    setSectionFilter(code)
    setShowLost(false)
    setPage(1)
  }

  // Across every section, so the section selection is dropped - the Section
  // column comes back to say where each one was.
  function selectLost() {
    setSectionFilter('')
    setStatusFilter('')
    setShowLost(true)
    setPage(1)
  }

  function handleDateChange(nextRange) {
    setDateRange(nextRange)
    setPage(1)
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <LeadAvatar name={row.name} />
          <span className="font-medium text-slate-900">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      align: 'center',
      render: (row) => (
        <div>
          <p className="text-sm text-slate-900">{row.phone}</p>
          {row.email && <p className="text-xs text-slate-500">{row.email}</p>}
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      align: 'center',
      render: (row) => (
        <LeadCourseCell
          key={row.id}
          lead={row}
          options={courseCatalogQuery.data ?? []}
          onError={setEditError}
        />
      ),
    },
    // Redundant once a section is already active (every visible row is that
    // section by definition) - only shown in the unscoped "All Sections"
    // view, and never for a Section Admin.
    ...(effectiveSectionFilter
      ? []
      : [
          {
            key: 'section',
            header: 'Section',
            align: 'center',
            render: (row) => (row.section ? <Badge tone="blue">{sectionByCode[row.section]?.label ?? row.section}</Badge> : '—'),
          },
        ]),
    { key: 'date', header: 'Date', align: 'center', render: (row) => formatDate(row.created_at) },
    // Straight after Date, where it used to be a second reading of that date.
    // It isn't any more: the group is recorded on the Induction Call Form and
    // changed from here, and a student who moves keeps the date they arrived
    // on. Editable for that reason - classes fill up and students switch, and
    // the person who has to act on it is looking at this column.
    {
      key: 'foundation_group',
      header: 'Group',
      align: 'center',
      render: (row) => (
        <LeadGroupCell key={row.id} lead={row} options={groupOptions} onError={setEditError} />
      ),
    },
    {
      key: 'batch_number',
      header: 'Batch',
      align: 'center',
      render: (row) => <BatchCell key={row.id} lead={row} onError={setEditError} />,
    },
    {
      key: 'payment_plan',
      header: 'Payment Method',
      align: 'center',
      render: (row) => (
        <PaymentPlanCell key={row.id} lead={row} pricing={pricingQuery.data} onError={setEditError} />
      ),
    },
    // Between Payment Method and Payment Remarks: how much, through which
    // account, then what the caller made of it.
    {
      key: 'paying_amount',
      header: 'Paying Amount',
      align: 'center',
      render: (row) => <AmountCell key={row.id} lead={row} onError={setEditError} />,
    },
    {
      key: 'qr_code',
      header: 'QR-Code',
      align: 'center',
      render: (row) => (
        <SelectBadgeCell
          key={row.id}
          lead={row}
          field="qr_code"
          options={qrCodeOptions}
          placeholder="Select…"
          allowAdd
          // Plain text, not a badge - thirty accounts cannot each carry a
          // meaningful colour, and colouring some would imply a grouping.
          plain
          onError={setEditError}
        />
      ),
    },
    // The day the student picked on the Foundation Form's "When will you make
    // the payment?" step - stored on the lead's raw form answers since
    // submission, just never shown on the board. Next to Payment Remarks
    // because it's what the payment call is chasing.
    {
      key: 'payment_date',
      header: 'Payment Date',
      align: 'center',
      render: (row) => {
        const day = row.raw_form_data?.payment_date
        if (!day) return <span className="text-slate-400">—</span>
        return (
          <div className="whitespace-nowrap">
            <p className="text-sm text-slate-900">{formatDate(day)}</p>
            {row.raw_form_data?.payment_timeline && (
              <p className="text-xs text-slate-500">{row.raw_form_data.payment_timeline}</p>
            )}
          </div>
        )
      },
    },
    {
      key: 'payment_call_remarks',
      header: 'Payment Remarks',
      align: 'center',
      render: (row) => (
        <SelectBadgeCell
          key={row.id}
          lead={row}
          field="payment_call_remarks"
          options={callRemarkOptions}
          displayByValue={CALL_REMARK_BY_VALUE}
          placeholder="Select…"
          allowAdd
          onError={setEditError}
        />
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      align: 'center',
      render: (row) => {
        const stage = LEAD_STAGE_BY_VALUE[row.status]
        const style = STAGE_CELL_STYLES[row.status] ?? 'bg-slate-600 text-white'
        return (
          // Same geometry as Badge (which this can't use - it needs solid
          // fills Badge's tone map doesn't carry), so the Stage chip and the
          // Payment Remarks chip beside it are the same object in two colours.
          <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${style}`}>
            {stage?.label ?? titleCase(row.status)}
          </span>
        )
      },
    },
    // Why and when they were lost - what the Quit Students tab is read for.
    ...(showLost
      ? [
          {
            key: 'lost_reason',
            header: 'Lost Reason',
            align: 'center',
            render: (row) => <TruncatedText text={row.lost_reason} />,
          },
          {
            key: 'lost_at',
            header: 'Lost On',
            align: 'center',
            render: (row) => (row.lost_at ? formatDate(row.lost_at) : '—'),
          },
        ]
      : []),
    { key: 'query', header: 'Query', align: 'center', render: (row) => <TruncatedText text={row.notes} /> },
    {
      key: 'remarks',
      header: 'Remarks',
      align: 'center',
      render: (row) => <LeadRemarksCell key={row.id} lead={row} onError={setEditError} />,
    },
    // Delete only: viewing is the row click, and every other field on a lead
    // is edited in its own cell rather than through an edit form.
    ...(canDeleteLead
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'center',
            render: (row) => (
              <RowActions
                onDelete={() => {
                  // Clear a previous row's failure so it doesn't greet you here.
                  deleteMutation.reset()
                  setDeletingLead(row)
                }}
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      {scopedSection ? (
        <LeadSectionStageStats
          total={total}
          stages={LEAD_STAGES}
          byStatus={byStatus}
          activeStage={statusFilter}
          onSelect={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        />
      ) : (
        <LeadSectionStats
          total={total}
          sections={sectionOptions}
          bySection={bySection}
          activeSection={sectionFilter}
          onSelect={selectSection}
          lostCount={byStatus.lost}
          isLostActive={showLost}
          onSelectLost={selectLost}
        />
      )}

      {/* One toolbar card, matching the Induction board: search and the filters
          are the same job, so they sit on one surface instead of floating
          loose above the table. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Row 1 finds (text, date, order); row 2 narrows by value and holds
            the page's one primary action, anchored right. */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-55 flex-1">
            {/* z-10: Input wraps its field in a positioned span, which would
                otherwise paint over this icon. */}
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Search by name, course…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>

          {/* shrink-0: the search box gives way instead of the segments. */}
          <div className="shrink-0">
            <DatePresetFilter value={dateRange} onChange={handleDateChange} />
          </div>

          <SortOrderSelect
            value={sortOrder}
            onChange={(nextOrder) => {
              setSortOrder(nextOrder)
              setPage(1)
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Filters</span>
          <FilterDropdown
            label="Course"
            value={courseFilter}
            options={courseOptions.map((course) => ({ value: course, label: course }))}
            onChange={(value) => {
              setCourseFilter(value)
              setPage(1)
            }}
          />

          {/* No Section filter here: the stat cards above already are the
              section switcher, and two controls driving one piece of state
              just invited them to disagree on screen. */}
          {/* Every row on the Quit Students tab is the same stage. */}
          {!showLost && (
            <FilterDropdown
              label="Stage"
              value={statusFilter}
              options={LEAD_STAGES.map((stage) => ({ value: stage.value, label: stage.label }))}
              onChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            />
          )}

          {/* Both name their values exactly as the columns they filter do -
              PAYMENT_PLAN_LABELS and CALL_REMARK_OPTIONS are the same two
              lists the cells render from, so a filter can't offer a wording
              the board never shows. */}
          <FilterDropdown
            label="Payment Method"
            value={planFilter}
            options={Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              setPlanFilter(value)
              setPage(1)
            }}
          />

          {/* Same list the QR-Code cells offer, added accounts included. */}
          <FilterDropdown
            label="QR Code"
            value={qrCodeFilter}
            options={qrCodeOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => {
              setQrCodeFilter(value)
              setPage(1)
            }}
          />

          <FilterDropdown
            label="Payment Remarks"
            value={callRemarkFilter}
            options={callRemarkOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => {
              setCallRemarkFilter(value)
              setPage(1)
            }}
          />

          {/* A fixed list rather than options read off the data: "nobody is in
              Group 3 this month" is an answer the filter should be able to
              give rather than an option it quietly drops. */}
          <FilterDropdown
            label="Group"
            value={groupFilter}
            options={FOUNDATION_GROUP_OPTIONS}
            onChange={(value) => {
              setGroupFilter(value)
              setPage(1)
            }}
          />

          {/* Most leads still arrive through the Form Collection forms; this
              is for the walk-in or phone enquiry with nobody to fill one in. */}
          {canCreateLead && (
            <Button className="ml-auto shrink-0" onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Create Lead
            </Button>
          )}
        </div>
      </div>

      <TableCard>
        {/* Clicking anywhere on a row opens that lead, so there's no separate
            View column. Safe because every inline editor in the row (the
            payment-remarks select, the remarks popover) calls stopPropagation
            on each click path it owns - including its portal backdrop, which
            bubbles through React's component tree rather than the DOM and
            would otherwise open this modal while dismissing itself. Keep that
            up in anything interactive added to a row later. */}
        <DataTable
          columns={columns}
          rows={items}
          isLoading={isLoading}
          error={error}
          onRowClick={(row) => setViewingLead(row)}
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={filteredTotal}
          pageSize={pageSize}
        />
      </TableCard>

      {openLead && <LeadDetailModal lead={openLead} onClose={closeLead} />}

      {deletingLead && (
        <ConfirmDeleteModal
          describe={`${deletingLead.name} (${deletingLead.phone})`}
          consequence="The lead is removed from the board, along with its remarks and payment history."
          error={deleteMutation.error ? getApiErrorMessage(deleteMutation.error) : null}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deletingLead.id)}
          onClose={() => setDeletingLead(null)}
        />
      )}

      {isCreating && (
        <CreateLeadModal
          sections={sectionOptions}
          // No course list passed: the modal asks the Foundation Form's
          // program question instead, and the backend derives the course from
          // whichever program was picked.
          // Prefilled with whichever section card is selected, so the row lands
          // in the view you were already looking at.
          defaultSection={effectiveSectionFilter}
          lockSection={Boolean(scopedSection)}
          onClose={() => setIsCreating(false)}
        />
      )}

      <Toast message={editError} onDismiss={() => setEditError(null)} />
    </div>
  )
}
