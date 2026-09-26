import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { IncomeApprovalsTab } from '@/components/payments/IncomeApprovalsTab'

// The money direction is the point of this control, so income and expense keep
// their own accent rather than the neutral raised pill TabStrip uses.
//
// Named tokens rather than the raw hex these were written in. Same pixels -
// #DCFCE7/#059669 and #FEF2F2/#DC2626 are green-100/emerald-600 and
// red-50/red-600 exactly - but spelled the way the rest of the app spells
// them, so a colour here can be matched to a colour anywhere else.
const SPLIT_TAB_STYLES = {
  income: { icon: ArrowDownLeft, active: 'bg-green-100 text-emerald-600' },
  expense: { icon: ArrowUpRight, active: 'bg-red-50 text-red-600' },
}

function SplitTabs({ tabs, active, onChange }) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-lg border border-slate-200">
      {tabs.map((tab, index) => {
        const style = SPLIT_TAB_STYLES[tab.key] ?? SPLIT_TAB_STYLES.income
        const Icon = style.icon
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${
              index > 0 ? 'border-l border-slate-200' : ''
            } ${isActive ? style.active : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function ComingSoon({ label }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
      {label} is coming soon.
    </p>
  )
}

function ApprovalsTab() {
  const [approvalTab, setApprovalTab] = useState('income')
  const statsQuery = useQuery({ queryKey: ['leads-stats'], queryFn: leadService.getStats })
  const incomeCount = statsQuery.data?.by_status?.financial_approval ?? 0

  return (
    <div>
      <SplitTabs
        tabs={[
          { key: 'income', label: `Income Approvals (${incomeCount})` },
          { key: 'expense', label: 'Expense Approvals (0)' },
        ]}
        active={approvalTab}
        onChange={setApprovalTab}
      />
      {approvalTab === 'income' ? <IncomeApprovalsTab /> : <ComingSoon label="Expense Approvals" />}
    </div>
  )
}

// The Finance board approves payments, and that is all it does. What has been
// collected and what is still owed - and the chasing that follows, reminders
// to a section's admins and non-payment reports to HR - is the Statistics
// Finance tab's (pages/statistics/FinanceBoard).
export function PaymentsPage() {
  return <ApprovalsTab />
}
