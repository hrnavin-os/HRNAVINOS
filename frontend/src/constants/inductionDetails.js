// The Details answer on the Update form's Remarks page: whether the candidate
// will attend. A choice of two rather than the free text it used to be, so the
// board can show it as a column and filter on it.
//
// The stored value is the label itself (InductionEntry.remarks.details), which
// is why entries answered in free text before this still read back - they just
// match neither option. The form offers only these two, and leaves such an
// answer stored until one of them is picked; the column and the filter still
// show it, so those entries can be found and answered.
export const DETAILS_OPTIONS = [
  { value: 'Will attend', tone: 'emerald' },
  { value: 'Will not attend', tone: 'red' },
]

export const DETAILS_VALUES = DETAILS_OPTIONS.map((option) => option.value)
