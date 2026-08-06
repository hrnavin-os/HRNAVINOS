import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { PAYMENT_PLAN_LABELS, INSTALLMENT_MODE_LABELS } from '@/constants/installmentPaymentModes'
import { EMPTY_CASHBOOK_FILTERS, isCashbookFiltered } from '@/utils/cashbookFilters'

export function CashbookFilters({ filters, onChange, resultCount, totalCount }) {
  const set = (patch) => onChange({ ...filters, ...patch })
  const isFiltered = isCashbookFiltered(filters)

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <Input
            placeholder="Search name, phone, email or course…"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
            rightElement={<Search className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />}
          />
        </div>

        <DateRangeFilter
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={({ dateFrom, dateTo }) => set({ dateFrom, dateTo })}
        />

        <Select
          className="w-auto"
          value={filters.plan}
          onChange={(event) => set({ plan: event.target.value })}
          aria-label="Filter by payment plan"
        >
          <option value="">All plans</option>
          {Object.entries(PAYMENT_PLAN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          className="w-auto"
          value={filters.mode}
          onChange={(event) => set({ mode: event.target.value })}
          aria-label="Filter by payment mode"
        >
          <option value="">All modes</option>
          {Object.entries(INSTALLMENT_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        {isFiltered && (
          <Button variant="ghost" onClick={() => onChange(EMPTY_CASHBOOK_FILTERS)}>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Says out loud that the totals above are a subset, so a filtered
          Overall Income figure can't be mistaken for the full one. */}
      {isFiltered && (
        <p className="mt-2 text-xs text-slate-500">
          Showing <span className="font-medium text-slate-700 tabular-nums">{resultCount}</span> of{' '}
          <span className="font-medium text-slate-700 tabular-nums">{totalCount}</span> entries. Totals above reflect
          this filter.
        </p>
      )}
    </div>
  )
}
