import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { formatCurrency } from '@/utils/formatters'
import { getLeadPaymentSummary } from '@/utils/leadPayment'

// `leads` is passed in already filtered by CashbookTab, so these totals always
// describe exactly the rows in the table below rather than a different set.
//
// The shared StatCard, in the same wrapping row every other board uses. This
// file used to carry its own near-copy - a left-edge accent bar and four
// hardcoded hex colours - which meant the Payments summary was the one place
// in the ERP where a stat card looked like something else. Passive here: these
// three total the table below rather than selecting a view, and StatCard drops
// to a plain div when it is given no onClick.
export function CashbookSummary({ leads = [] }) {
  const totalIncome = leads.reduce((sum, lead) => sum + Number(getLeadPaymentSummary(lead).paidAmount ?? 0), 0)
  const totalExpense = 0 // No expense tracking exists yet — see Overall Expense / Expense Approvals placeholders.
  const balance = totalIncome - totalExpense

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard
        label="Overall Income"
        value={formatCurrency(totalIncome)}
        hint="For selected period"
        icon={ArrowDownLeft}
        toneName="emerald"
      />
      <StatCard
        label="Expense"
        value={formatCurrency(totalExpense)}
        hint="For selected period"
        icon={ArrowUpRight}
        toneName="red"
      />
      <StatCard
        label="Balance"
        value={formatCurrency(balance)}
        hint="Income − Expense (period)"
        icon={Wallet}
        toneName="blue"
      />
    </div>
  )
}
