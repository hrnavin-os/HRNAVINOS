import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  GraduationCap,
  Hourglass,
  Wallet,
} from 'lucide-react'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { DataTable } from '@/components/ui/DataTable'
import { DateFilter } from '@/components/ui/DateFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { TabStrip } from '@/components/ui/TabStrip'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyNote, Panel, SegmentedToggle } from '@/components/analytics/Panel'
import { MiniStatStrip, StatTile } from '@/components/analytics/StatTile'
import { IncomeDetailModal } from '@/components/payments/IncomeDetailModal'
import { OverallIncomeTab } from '@/components/payments/OverallIncomeTab'
import { PAYMENT_PLAN_LABELS, INSTALLMENT_MODE_LABELS } from '@/constants/installmentPaymentModes'
import { formatCurrency, formatDate, titleCase } from '@/utils/formatters'
import { getAfterPlacementFee, getEmiPaymentHealth, getLeadPaymentSummary } from '@/utils/leadPayment'

const DAY = 24 * 60 * 60 * 1000
const isoDay = (date) => date.toISOString().slice(0, 10)

// Where one student stands on repaying. A partition, not a set of flags: each
// approved student is in exactly one, so the health panel's rows add up to the
// students it is about. Two missed EMIs outranks plain overdue because it is
// the one that ends in the student being marked Lost.
//
// Status colours only, each with its own icon and word - the state is never
// carried by the colour alone.
const STATUSES = {
  missed_twice: { label: '2 EMIs missed', tone: 'red', badge: 'red', icon: AlertTriangle, rank: 0 },
  overdue: { label: 'Overdue', tone: 'red', badge: 'red', icon: CalendarClock, rank: 1 },
  due_soon: { label: 'Due within 7 days', tone: 'amber', badge: 'amber', icon: Clock, rank: 2 },
  on_track: { label: 'On track', tone: 'brand', badge: 'blue', icon: Hourglass, rank: 3 },
  paid: { label: 'Paid in full', tone: 'emerald', badge: 'green', icon: CheckCircle2, rank: 4 },
}
const STATUS_ORDER = Object.keys(STATUSES)

function repaymentStatus(summary, health, today, weekAhead) {
  if (!summary.hasPlan || summary.dueAmount <= 0) return 'paid'
  if (health.status === 'lost_eligible') return 'missed_twice'
  const due = summary.balanceDueAt?.slice(0, 10)
  if (health.status === 'missed_once' || (due && due < today)) return 'overdue'
  if (due && due <= weekAhead) return 'due_soon'
  return 'on_track'
}

// One row per lead with every figure the board reads, worked out once.
function readLeads(leads) {
  const now = new Date()
  const today = isoDay(now)
  const weekAhead = isoDay(new Date(now.getTime() + 7 * DAY))
  return leads.map((lead) => {
    const summary = getLeadPaymentSummary(lead)
    const paid = Number(summary.paidAmount ?? 0)
    const due = summary.hasPlan ? Math.max(Number(summary.dueAmount ?? 0), 0) : 0
    const afterPlacement = getAfterPlacementFee(lead)
    return {
      id: lead.id,
      lead,
      summary,
      approved: lead.status === 'batch_confirmation',
      paid,
      due,
      status: repaymentStatus(summary, getEmiPaymentHealth(lead), today, weekAhead),
      afterPlacement: afterPlacement && !/^nil$/i.test(afterPlacement) ? afterPlacement : null,
    }
  })
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : null)

// Collected against billed, per value of one field - payment plan, section.
function rollUp(rows, keyOf, labelOf) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyOf(row) ?? 'none'
    if (!groups.has(key)) groups.set(key, { key, label: key === 'none' ? 'Not set' : labelOf(key), students: 0, paid: 0, due: 0 })
    const group = groups.get(key)
    group.students += 1
    group.paid += row.paid
    group.due += row.due
  }
  return [...groups.values()].sort((a, b) => b.paid + b.due - (a.paid + a.due))
}

/**
 * Collected against what was billed, one bar per value.
 *
 * One measure - how much of each value's fees has come in - so one hue on a
 * neutral track: the filled part is collected, the track behind it is what is
 * still owed. The figures beside the bar name both, so nothing rests on the
 * reader judging a length.
 */
function CollectionBars({ groups }) {
  if (!groups.length) return <EmptyNote>Nothing billed in this window.</EmptyNote>
  return (
    <ul className="space-y-3">
      {groups.map((group) => {
        const billed = group.paid + group.due
        const share = billed > 0 ? group.paid / billed : 0
        return (
          <li key={group.key} title={`${group.label}: ${formatCurrency(group.paid)} collected, ${formatCurrency(group.due)} outstanding`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-slate-700">
                {group.label}
                <span className="ml-1.5 font-normal text-slate-400">
                  {group.students} student{group.students === 1 ? '' : 's'}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                <span className="font-bold text-slate-900">{formatCurrency(group.paid)}</span> of{' '}
                {formatCurrency(billed)}
                <span className="ml-1.5 font-semibold text-slate-700">{pct(group.paid, billed) ?? '—'}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${share * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Money in by how it arrived. One series, so one hue, scaled to the largest.
function ModeBars({ rows }) {
  const byMode = new Map()
  for (const row of rows) {
    if (!row.paid) continue
    const mode = row.summary.mode ?? 'none'
    byMode.set(mode, (byMode.get(mode) ?? 0) + row.paid)
  }
  const items = [...byMode.entries()].sort((a, b) => b[1] - a[1])
  if (!items.length) return <EmptyNote>No payments recorded in this window.</EmptyNote>
  const top = items[0][1]
  const total = items.reduce((all, [, amount]) => all + amount, 0)
  return (
    <ul className="space-y-3">
      {items.map(([mode, amount]) => (
        <li key={mode} title={`${formatCurrency(amount)} (${pct(amount, total)})`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="font-medium text-slate-700">
              {mode === 'none' ? 'Not recorded' : INSTALLMENT_MODE_LABELS[mode] ?? titleCase(mode)}
            </span>
            <span className="tabular-nums text-slate-500">
              <span className="font-bold text-slate-900">{formatCurrency(amount)}</span>
              <span className="ml-1.5">{pct(amount, total)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(amount / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// How many approved students sit in each repayment state, and what they owe.
function HealthList({ rows }) {
  const total = rows.length
  if (!total) return <EmptyNote>No approved students in this window.</EmptyNote>
  return (
    <ul className="divide-y divide-slate-100">
      {STATUS_ORDER.map((key) => {
        const status = STATUSES[key]
        const members = rows.filter((row) => row.status === key)
        const Icon = status.icon
        return (
          <li key={key} className="flex items-center gap-3 py-2">
            <Badge tone={status.badge}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
              {status.label}
            </Badge>
            <span className="ml-auto text-sm font-bold tabular-nums text-slate-900">{members.length}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-400">{pct(members.length, total)}</span>
            <span className="w-24 text-right text-xs tabular-nums text-slate-600">
              {key === 'paid' ? '—' : formatCurrency(sum(members, 'due'))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const CHASE_VIEWS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'owing', label: 'All dues' },
  { value: 'after_placement', label: 'After placement' },
  { value: 'ledger', label: 'All income' },
]

const chaseColumns = [
  {
    key: 'name',
    header: 'Student',
    render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.lead.name}</p>
        <p className="text-xs text-slate-500">{row.lead.phone}</p>
      </div>
    ),
  },
  {
    key: 'section',
    header: 'Section',
    align: 'center',
    render: (row) => (row.lead.section ? <Badge tone="violet">{row.lead.section.toUpperCase()}</Badge> : '—'),
  },
  {
    key: 'plan',
    header: 'Plan',
    render: (row) => PAYMENT_PLAN_LABELS[row.lead.payment_plan] ?? (row.lead.payment_plan ? titleCase(row.lead.payment_plan) : '—'),
  },
  { key: 'paid', header: 'Paid', align: 'right', numeric: true, render: (row) => formatCurrency(row.paid) },
  {
    key: 'due',
    header: 'Due',
    align: 'right',
    numeric: true,
    render: (row) =>
      row.due > 0 ? <span className="font-semibold text-amber-700">{formatCurrency(row.due)}</span> : '—',
  },
  {
    key: 'due_at',
    header: 'Next due',
    render: (row) => (row.due > 0 && row.summary.balanceDueAt ? formatDate(row.summary.balanceDueAt) : '—'),
  },
  { key: 'after', header: 'After placement', align: 'right', render: (row) => row.afterPlacement ?? '—' },
  {
    key: 'status',
    header: 'Status',
    align: 'center',
    render: (row) => {
      const status = STATUSES[row.status]
      const Icon = status.icon
      return (
        <Badge tone={status.badge}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          {status.label}
        </Badge>
      )
    },
  },
]

/**
 * The Finance tab of Statistics: what has been collected, what is still owed
 * and how late, and the chasing that follows.
 *
 * The chasing lives here rather than on the Finance board. Finance approves
 * payments; following a repayment up - asking a section's admins to call the
 * student, reporting a non-payer to HR, marking two missed EMIs Lost - is done
 * from the student's popup on this tab.
 *
 * Totals are over the students Finance has approved (Batch Confirmation).
 * Those still waiting on approval are counted apart, since their money has not
 * been verified yet.
 */
export function FinanceBoard({ boardTabs, onOpenBoard }) {
  const { user } = useAuth()
  const scopedSection = user?.scoped_section || null
  const [dateRange, setDateRange] = useState(null)
  const [section, setSection] = useState('')
  const [view, setView] = useState('overdue')
  const [viewing, setViewing] = useState(null)

  const filters = {
    date_from: dateRange?.from || undefined,
    date_to: dateRange?.to || undefined,
    section: section || undefined,
  }
  const query = useQuery({
    queryKey: ['statistics', 'finance', filters],
    queryFn: () => leadService.getFinance(filters),
    placeholderData: (previous) => previous,
  })
  const sectionQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const sections = sectionQuery.data?.sections ?? []
  const sectionLabel = (code) => sections.find((item) => item.code === code)?.label ?? `Section ${code.toUpperCase()}`

  const rows = useMemo(() => readLeads(query.data ?? []), [query.data])
  const approved = rows.filter((row) => row.approved)
  const pending = rows.filter((row) => !row.approved)

  const collected = sum(approved, 'paid')
  const outstanding = sum(approved, 'due')
  const late = approved.filter((row) => row.status === 'overdue' || row.status === 'missed_twice')
  const owing = approved.filter((row) => row.due > 0)
  const afterPlacement = approved.filter((row) => row.afterPlacement)

  const chaseRows = {
    overdue: late,
    owing,
    after_placement: afterPlacement,
  }[view]
  const sortedChase = [...(chaseRows ?? [])].sort(
    (a, b) => STATUSES[a.status].rank - STATUSES[b.status].rank || b.due - a.due,
  )

  return (
    <div>
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Finance Analytics</h1>
              <p className="text-[11px] font-medium text-amber-600">Collections, dues &amp; repayment follow-up</p>
            </div>
          </div>
          <TabStrip tabs={boardTabs} value="finance" onChange={onOpenBoard} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Filters</span>
          <div className="w-56">
            <DateFilter grow label="Form date" value={dateRange} onChange={setDateRange} />
          </div>
          {!scopedSection && (
            <div className="w-44">
              <FilterDropdown
                grow
                label="Section"
                value={section}
                options={sections.map((item) => ({ value: item.code, label: item.label }))}
                onChange={setSection}
              />
            </div>
          )}
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            {approved.length} approved student{approved.length === 1 ? '' : 's'} in scope
          </span>
        </div>
      </div>

      <ErrorMessage message={query.error ? getApiErrorMessage(query.error) : null} />

      {query.isLoading && !query.data ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Collected"
              value={formatCurrency(collected)}
              share={pct(collected, collected + outstanding)}
              deltaLabel={`of ${formatCurrency(collected + outstanding)} billed`}
              icon={BadgeIndianRupee}
              tone="emerald"
            />
            <StatTile
              label="Outstanding"
              value={formatCurrency(outstanding)}
              deltaLabel={`${owing.length} student${owing.length === 1 ? '' : 's'} still owe`}
              icon={CircleDollarSign}
              tone="amber"
            />
            <StatTile
              label="Overdue"
              value={formatCurrency(sum(late, 'due'))}
              share={late.length ? `${late.length}` : null}
              deltaLabel="students past a due date"
              icon={AlertTriangle}
              tone="red"
            />
            <StatTile
              label="Awaiting approval"
              value={pending.length}
              deltaLabel={`${formatCurrency(sum(pending, 'paid'))} paid, not yet verified`}
              icon={Hourglass}
              tone="slate"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Collection by payment plan"
              subtitle="Collected against billed, per plan"
              hint="Billed is what the plan's installments add up to; the track behind each bar is what is still owed."
            >
              <CollectionBars
                groups={rollUp(approved, (row) => row.lead.payment_plan, (key) => PAYMENT_PLAN_LABELS[key] ?? titleCase(key))}
              />
            </Panel>
            <Panel title="Collection by section" subtitle="Collected against billed, per section">
              <CollectionBars groups={rollUp(approved, (row) => row.lead.section, sectionLabel)} />
            </Panel>
            <Panel
              title="Repayment health"
              subtitle="Where each approved student stands, and what they owe"
              hint="Overdue: a due date has passed with the balance unpaid. 2 EMIs missed: two EMI dates in a row have passed unpaid - the student can be marked Lost from their popup."
            >
              <HealthList rows={approved} />
            </Panel>
            <Panel title="Collected by payment mode" subtitle="How the money came in">
              <ModeBars rows={approved} />
            </Panel>
          </div>

          <MiniStatStrip
            items={[
              {
                label: 'Due within 7 days',
                value: formatCurrency(sum(approved.filter((row) => row.status === 'due_soon'), 'due')),
                icon: Clock,
                tone: 'amber',
              },
              {
                label: 'After placement receivable',
                value: `${afterPlacement.length} student${afterPlacement.length === 1 ? '' : 's'}`,
                icon: GraduationCap,
                tone: 'brand',
              },
              {
                label: 'Average collected per student',
                value: formatCurrency(approved.length ? collected / approved.length : 0),
                icon: Wallet,
                tone: 'emerald',
              },
            ]}
          />

          <Panel
            title="Repayments to follow up"
            subtitle="Open a student to remind their section admins, report non-payment to HR, or mark them Lost"
            action={<SegmentedToggle label="Which students" options={CHASE_VIEWS} value={view} onChange={setView} />}
          >
            {view === 'ledger' ? (
              <OverallIncomeTab leads={approved.map((row) => row.lead)} isLoading={query.isLoading} />
            ) : (
              <DataTable
                columns={chaseColumns}
                rows={sortedChase}
                isLoading={query.isLoading}
                emptyMessage={
                  view === 'overdue' ? 'Nobody is past a due date in this window.' : 'Nobody to follow up in this window.'
                }
                onRowClick={(row) => setViewing(row.lead)}
              />
            )}
          </Panel>
        </div>
      )}

      {viewing && <IncomeDetailModal lead={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
