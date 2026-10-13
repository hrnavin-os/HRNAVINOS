// The Details answer on the Update form's Remarks page: whether the candidate
// will attend. A choice rather than the free text it used to be, so the board
// can show it as a column and filter on it.
//
// The stored value (InductionEntry.remarks.details) is the answer's label, or
// for "Others" the text typed under it - so an entry answered in free text
// before this was a choice reads back as Others with its text already filled.
export const DETAILS_OPTIONS = [
  { value: 'Will attend', tone: 'emerald' },
  { value: 'Will not attend', tone: 'red' },
]

export const DETAILS_VALUES = DETAILS_OPTIONS.map((option) => option.value)

// The third choice in the dropdown. Never stored itself: what is stored is the
// text it requires, which is how anything outside DETAILS_VALUES counts as it.
export const DETAILS_OTHER = 'Others'

// What the board's Details filter sends for "Others" - OTHER_DETAILS in the
// backend's induction_entry_routes.py, which matches everything that is set
// and isn't one of DETAILS_VALUES.
export const DETAILS_OTHER_FILTER = '__other__'
