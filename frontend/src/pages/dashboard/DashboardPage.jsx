import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  GraduationCap,
  IndianRupee,
  PhoneCall,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { dashboardService } from '@/services/dashboardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { ActivityTrendChart } from '@/components/dashboard/ActivityTrendChart'
import { PipelineFunnel } from '@/components/dashboard/PipelineFunnel'
import { LEAD_STAGE_BY_VALUE } from '@/constants/leadStages'
import { shortMoney } from '@/constants/statisticsBoards'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useAuth } from '@/hooks/useAuth'

// The institute's clock, not the browser's: the greeting and the date line are
// about the day at the institute.
function istNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
}

function greeting() {
  const hour = istNow().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const TONES = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
}

// This month against last. No arrow when last month had nothing: a rise
// "from zero" is not a percentage.
function MonthDelta({ now, before }) {
  if (!before) {
    return <span className="text-xs text-slate-400">{now ? 'First this month' : 'Nothing yet this month'}</span>
  }
  const change = Math.round(((now - before) / before) * 100)
  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(change)}%
      <span className="ml-1 font-normal text-slate-500">vs last month</span>
    </span>
  )
}

function KpiCard({ label, value, icon: Icon, tone, footer, children }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${TONES[tone]}`}>
          <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</p>
      <div className="mt-2 min-h-5">{children}</div>
      {footer && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">{footer}</p>}
    </div>
  )
}

function Card({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  )
}

function CardLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </Link>
  )
}

function Empty({ children }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">{children}</p>
}

const STAGE_BADGE = {
  new_lead: 'bg-blue-50 text-blue-700 ring-blue-200',
  rnr: 'bg-red-50 text-red-700 ring-red-200',
  pre_screening: 'bg-amber-50 text-amber-800 ring-amber-200',
  financial_approval: 'bg-violet-50 text-violet-700 ring-violet-200',
  batch_confirmation: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lost: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

/**
 * The Super Admin's landing page: the institute's funnel at a glance.
 *
 * Read top to bottom the way the business runs - how many are coming in, how
 * many convert, how much money is in and still owed, then where the leads sit
 * and what needs chasing today. Every figure comes from the same collections
 * and rules as the boards it summarises (see dashboard_insights on the server).
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-insights'],
    queryFn: dashboardService.getInsights,
  })

  const today = istNow().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {greeting()}, {user?.first_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&rsquo;s how the institute is doing.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/statistics"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <BarChart3 className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
            Statistics
          </Link>
          <Link
            to="/leads"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Target className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Lead Dashboard
          </Link>
        </div>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={getApiErrorMessage(error)} />}

      {data && <DashboardBody data={data} />}
    </div>
  )
}

function DashboardBody({ data }) {
  const { kpis } = data
  const conversion = kpis.induction.total ? Math.round((kpis.moved_to_foundation / kpis.induction.total) * 100) : 0
  const collected = Number(kpis.collected)
  const outstanding = Number(kpis.outstanding)
  const billed = collected + outstanding
  const collectedShare = billed ? Math.round((collected / billed) * 100) : 0

  return (
    <div className="space-y-4">
      {/* The four numbers the page is opened for. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Foundation leads this month"
          value={kpis.foundation.this_month}
          icon={GraduationCap}
          tone="blue"
          footer={`${kpis.foundation.total} leads all time`}
        >
          <MonthDelta now={kpis.foundation.this_month} before={kpis.foundation.last_month} />
        </KpiCard>
        <KpiCard
          label="Induction candidates this month"
          value={kpis.induction.this_month}
          icon={PhoneCall}
          tone="orange"
          footer={`${kpis.induction.total} candidates all time`}
        >
          <MonthDelta now={kpis.induction.this_month} before={kpis.induction.last_month} />
        </KpiCard>
        <KpiCard
          label="Induction → Foundation"
          value={`${conversion}%`}
          icon={TrendingUp}
          tone="violet"
          footer={`${kpis.batch_confirmed} batch confirmed · ${kpis.quit} quit`}
        >
          <span className="text-xs text-slate-500">
            {kpis.moved_to_foundation} of {kpis.induction.total} candidates moved on
          </span>
        </KpiCard>
        <KpiCard
          label="Fees collected"
          value={shortMoney(collected)}
          icon={IndianRupee}
          tone="emerald"
          footer={`${shortMoney(outstanding)} still to collect`}
        >
          {/* Collected against everything billed so far. */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectedShare}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">{collectedShare}%</span>
          </div>
        </KpiCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Arrivals"
          subtitle="New candidates and leads per day, last 30 days"
          action={<CardLink to="/statistics">Open Statistics</CardLink>}
        >
          <ActivityTrendChart days={data.trend} />
        </Card>
        <Card
          title="Lead pipeline"
          subtitle="Where every Foundation lead is now"
          action={<CardLink to="/leads">Board</CardLink>}
        >
          <PipelineFunnel stages={data.pipeline} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Payments due"
          subtitle="Balances and scheduled payments, soonest first"
          action={<CardLink to="/payments">Finance</CardLink>}
        >
          {kpis.overdue_count > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>
                <span className="font-semibold">{kpis.overdue_count} overdue</span> ·{' '}
                {formatCurrency(kpis.overdue_amount)} past its date
              </span>
            </div>
          )}
          {data.upcoming_dues.length ? (
            <ul className="divide-y divide-slate-100">
              {data.upcoming_dues.map((due) => (
                <li key={`${due.lead_id}-${due.label}`} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      due.overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{due.name}</p>
                    <p className={`text-xs ${due.overdue ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                      {due.label} · {due.overdue ? 'was due' : 'due'} {formatDate(due.due)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(due.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing is waiting on a payment date.</Empty>
          )}
        </Card>

        <Card title="Top courses" subtitle="By leads, with how many confirmed">
          {data.top_courses.length ? (
            <ul className="space-y-3.5">
              {data.top_courses.map((course) => {
                const largest = data.top_courses[0].leads
                const rate = Math.round((course.confirmed / course.leads) * 100)
                return (
                  <li key={course.course} title={`${course.course}: ${course.leads} leads, ${course.confirmed} confirmed`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700">{course.course}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold text-slate-900">{course.leads}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{rate}% confirmed</span>
                      </span>
                    </div>
                    {/* The full bar is the course's leads; the darker part of
                        it is the ones confirmed. */}
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="relative h-full overflow-hidden rounded-full bg-blue-200"
                        style={{ width: `${(course.leads / largest) * 100}%` }}
                      >
                        <div className="h-full bg-blue-600" style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>No courses recorded on any lead yet.</Empty>
          )}
        </Card>

        <Card title="Latest leads" action={<CardLink to="/leads">View all</CardLink>}>
          {data.recent_leads.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recent_leads.map((lead) => {
                const stage = LEAD_STAGE_BY_VALUE[lead.status]
                return (
                  <li key={lead.lead_id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {initials(lead.name) || <Users className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {lead.course ?? 'No course yet'} · {formatDate(lead.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                        STAGE_BADGE[lead.status] ?? STAGE_BADGE.lost
                      }`}
                    >
                      {stage?.label ?? lead.status}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>No leads yet.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
