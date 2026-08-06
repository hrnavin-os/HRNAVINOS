// Filter state and matching for the Finance cashbook. Kept out of the
// CashbookFilters component file so that file only exports a component -
// mixing the two breaks React Fast Refresh for it.

export const EMPTY_CASHBOOK_FILTERS = { search: '', dateFrom: '', dateTo: '', plan: '', mode: '' }

export function isCashbookFiltered(filters) {
  return Object.values(filters).some(Boolean)
}

// Applied client-side: the Cashbook already pulls the whole batch-confirmation
// set in one request for the summary totals, so filtering here keeps the cards
// and the table on exactly the same rows without a second round trip.
export function applyCashbookFilters(leads, filters) {
  const term = filters.search.trim().toLowerCase()

  return leads.filter((lead) => {
    if (filters.plan && lead.payment_plan !== filters.plan) return false

    if (filters.mode) {
      // Mode lives on whichever installment was paid most recently, so match
      // any installment rather than just the latest - filtering by UPI should
      // still find a lead who paid one instalment by UPI and another by card.
      const modes = lead.installments?.length
        ? lead.installments.filter((installment) => installment.paid).map((installment) => installment.mode)
        : [lead.payment_mode]
      if (!modes.includes(filters.mode)) return false
    }

    // created_at is an ISO timestamp; the inputs are plain dates, so compare
    // on the date part only or a same-day "to" would exclude that whole day.
    const day = lead.created_at?.slice(0, 10) ?? ''
    if (filters.dateFrom && day < filters.dateFrom) return false
    if (filters.dateTo && day > filters.dateTo) return false

    if (term) {
      const haystack = [lead.name, lead.phone, lead.email, lead.course_interest]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }

    return true
  })
}
