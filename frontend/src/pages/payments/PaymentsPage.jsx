import { IncomeApprovalsTab } from '@/components/payments/IncomeApprovalsTab'

// The Finance board approves payments, and that is all it does: leads
// awaiting approval, and the students already approved. What has been
// collected and what is still owed - and the chasing that follows, reminders
// to a section's admins and non-payment reports to HR - is the Statistics
// Finance tab's (pages/statistics/FinanceBoard).
//
// There used to be an Income / Expense switch above this. Expense approvals
// were never built, so the switch only ever led to a "coming soon" note.
export function PaymentsPage() {
  return <IncomeApprovalsTab />
}
