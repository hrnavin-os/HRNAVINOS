// The two foundation classes a batch is split across.
//
// The class runs twice a month, a fortnight apart. Everyone who comes through
// the first sitting is Group 1, everyone through the second is Group 2 - both
// inside the *same* batch, since the batch is the month. So "Batch-28 · Group
// 2" reads as "the second foundation class of August".
//
// Nothing is stored: the backend derives a row's group from the date it already
// shows beside it (1st-15th, or 16th onward). See
// backend/app/utils/foundation_groups.py, which owns the rule; this file is
// only how the boards say it.
export const FOUNDATION_GROUPS = [1, 2]

// The filter dropdowns take string values, so these are strings while the API
// field is a number.
export const FOUNDATION_GROUP_OPTIONS = FOUNDATION_GROUPS.map((group) => ({
  value: String(group),
  label: `Group ${group}`,
}))

// Two hues so a column of them is scannable - which half of the month a row
// belongs to is the whole point of the column, and two shades of one colour
// would need reading rather than seeing.
const TONES = { 1: 'blue', 2: 'violet' }

export const foundationGroupTone = (group) => TONES[group] ?? 'slate'
export const foundationGroupLabel = (group) => (group ? `Group ${group}` : null)
