import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { getApiErrorMessage } from '@/services/apiClient'
import { IncomeApprovalsTab } from '@/components/payments/IncomeApprovalsTab'
import { OverallIncomeTab } from '@/components/payments/OverallIncomeTab'
import { CashbookSummary } from '@/components/payments/CashbookSummary'
import { CashbookFilters } from '@/components/payments/CashbookFilters'
import { EMPTY_CASHBOOK_FILTERS, applyCashbookFilters } from '@/utils/cashbookFilters'

const SPLIT_TAB_STYLES = {
  income: { icon: ArrowDownLeft, active: 'bg-[#DCFCE7] text-[#059669]' },
  expense: { icon: ArrowUpRight, active: 'bg-[#FEF2F2] text-[#DC2626]' },
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

function CashbookTab() {
  const [cashbookTab, setCashbookTab] = useState('income')
  const [filters, setFilters] = useState(EMPTY_CASHBOOK_FILTERS)

  // Fetched once here rather than in each child, so the summary cards and the
  // table are guaranteed to be describing the same rows - the cards say "for
  // selected period", which was only true while nothing could filter them.
  const query = useQuery({
    queryKey: ['overall-income'],
    queryFn: () => leadService.list({ status: 'batch_confirmation', page_size: 100 }),
  })

  const allLeads = query.data?.items ?? []
  const leads = applyCashbookFilters(allLeads, filters)

  return (
    <div>
      <CashbookSummary leads={leads} />
      <CashbookFilters
        filters={filters}
        onChange={setFilters}
        resultCount={leads.length}
        totalCount={allLeads.length}
      />
      <SplitTabs
        tabs={[
          { key: 'income', label: `Overall Income (${leads.length})` },
          { key: 'expense', label: 'Overall Expense (0)' },
        ]}
        active={cashbookTab}
        onChange={setCashbookTab}
      />
      {cashbookTab === 'income' ? (
        <OverallIncomeTab
          leads={leads}
          isLoading={query.isLoading}
          error={query.error ? getApiErrorMessage(query.error) : null}
        />
      ) : (
        <ComingSoon label="Overall Expense" />
      )}
    </div>
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

export function PaymentsPage() {
  const [mainTab, setMainTab] = useState('cashbook')

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setMainTab('cashbook')}
          className={`px-3 pb-2 text-sm font-semibold transition-colors ${
            mainTab === 'cashbook'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Cashbook
        </button>
        <button
          type="button"
          onClick={() => setMainTab('approvals')}
          className={`px-3 pb-2 text-sm font-semibold transition-colors ${
            mainTab === 'approvals'
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Approvals
        </button>
      </div>

      {mainTab === 'cashbook' ? <CashbookTab /> : <ApprovalsTab />}
    </div>
  )
}
