import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'

function StatCard({ label, value, subtitle, icon: Icon, borderColor, iconBg, iconColor, valueColor }) {
  return (
    <div className={`flex items-center justify-between rounded-xl border border-slate-200 border-l-4 ${borderColor} bg-white p-5 shadow-sm`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{formatCurrency(value)}</p>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </span>
    </div>
  )
}

// `leads` is passed in already filtered by CashbookTab, so these totals always
// describe exactly the rows in the table below rather than a different set.
export function CashbookSummary({ leads = [] }) {
  const totalIncome = leads.reduce((sum, lead) => sum + Number(getLeadPaymentSummary(lead).paidAmount ?? 0), 0)
  const totalExpense = 0 // No expense tracking exists yet — see Overall Expense / Expense Approvals placeholders.
  const balance = totalIncome - totalExpense

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Overall Income"
        value={totalIncome}
        subtitle="For selected period"
        icon={ArrowDownLeft}
        borderColor="border-l-[#059669]"
        iconBg="bg-[#DCFCE7]"
        iconColor="text-[#059669]"
        valueColor="text-[#059669]"
      />
      <StatCard
        label="Expense"
        value={totalExpense}
        subtitle="For selected period"
        icon={ArrowUpRight}
        borderColor="border-l-[#DC2626]"
        iconBg="bg-[#FEF2F2]"
        iconColor="text-[#DC2626]"
        valueColor="text-[#DC2626]"
      />
      <StatCard
        label="Balance"
        value={balance}
        subtitle="Income − Expense (period)"
        icon={Wallet}
        borderColor="border-l-blue-600"
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        valueColor="text-blue-600"
      />
    </div>
  )
}
