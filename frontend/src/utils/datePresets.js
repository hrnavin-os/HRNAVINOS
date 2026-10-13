// The one-click ranges DateFilter offers. Here rather than in the component so
// a board can pass its own list without the component file exporting
// constants, which breaks fast refresh.

// `days` from today: negative is the past, positive the future.
function shiftDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

// First and last day of the month `offset` months from this one. Day 0 of the
// next month is the last day of this one, so February needs no special case.
function month(offset) {
  const now = new Date()
  return [new Date(now.getFullYear(), now.getMonth() + offset, 1), new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)]
}

// The ranges worth one click. Ranges are functions rather than values because
// the board stays open across midnight on a long shift - "Today" has to mean
// the day it is when you pick it, not the day the page was loaded.
export const PAST_PRESETS = [
  { key: 'today', label: 'Today', range: () => [shiftDays(0), shiftDays(0)] },
  { key: 'yesterday', label: 'Yesterday', range: () => [shiftDays(-1), shiftDays(-1)] },
  { key: 'last_7', label: 'Last 7 days', range: () => [shiftDays(-6), shiftDays(0)] },
  { key: 'this_month', label: 'This month', range: () => month(0) },
  { key: 'last_month', label: 'Last month', range: () => month(-1) },
]

// For a date booked ahead rather than one already past - the induction call
// schedule - where the next few days are the ones worth a click. Yesterday
// stays for the calls that were due and need chasing.
export const UPCOMING_PRESETS = [
  { key: 'today', label: 'Today', range: () => [shiftDays(0), shiftDays(0)] },
  { key: 'tomorrow', label: 'Tomorrow', range: () => [shiftDays(1), shiftDays(1)] },
  { key: 'yesterday', label: 'Yesterday', range: () => [shiftDays(-1), shiftDays(-1)] },
  { key: 'next_7', label: 'Next 7 days', range: () => [shiftDays(0), shiftDays(6)] },
  { key: 'this_month', label: 'This month', range: () => month(0) },
]
