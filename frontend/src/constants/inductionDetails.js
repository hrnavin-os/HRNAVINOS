// The Details answer on the Update form's Remarks page: whether the candidate
// will attend. A choice of two rather than the free text it used to be, so the
// board can show it as a column and filter on it.
//
// The stored value is the label itself (InductionEntry.remarks.details), which
// is why entries answered in free text before this still read back - they just
// match neither option, and the form, the column and the filter all keep them.
export const DETAILS_OPTIONS = [
  { value: 'Will attend', tone: 'emerald' },
  { value: 'Will not attend', tone: 'red' },
]

export const DETAILS_VALUES = DETAILS_OPTIONS.map((option) => option.value)
