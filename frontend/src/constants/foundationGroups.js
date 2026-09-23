// The foundation class groups a student can be put in.
//
// Recorded, not derived. This used to read a date - the 1st-15th of the month
// was Group 1, the 16th onward Group 2 - which meant the group was whatever
// the calendar said and nobody could correct it. There are three classes, not
// two halves of a month, and students are moved between them; a rule that
// reads a date can express neither.
//
// The backend owns the field now (app/utils/foundation_groups.py). This file
// is only how the boards say it: the fallback option list, and the colours.
export const FOUNDATION_GROUPS = [1, 2, 3]

// The filter dropdowns take string values, so these are strings while the API
// field is a number.
//
// A fixed list rather than options read off the data, for the same reason the
// section filter has one: "nobody is in Group 3 this month" is an answer the
// filter should be able to give rather than an option it quietly drops.
export const FOUNDATION_GROUP_OPTIONS = FOUNDATION_GROUPS.map((group) => ({
  value: String(group),
  label: `Group ${group}`,
}))

// What the editable cells offer. The same labels the Induction Call Form's
// Group dropdown is seeded with, so a group picked on the board and a group
// picked on the form are written the same way.
export const FOUNDATION_GROUP_LABELS = FOUNDATION_GROUPS.map((group) => `Group ${group}`)

// One hue per group so a column of them is scannable - which class a row
// belongs to is the whole point of the column, and three shades of one colour
// would need reading rather than seeing.
const TONES = { 1: 'blue', 2: 'violet', 3: 'teal' }

export const foundationGroupTone = (group) => TONES[group] ?? 'slate'
export const foundationGroupLabel = (group) => (group ? `Group ${group}` : null)

// "Group 2" -> 2. The cells store and send a number; the dropdowns they are
// built from deal in labels, because that is what an admin types into the
// form's option list. Anything with no digits in it is not a group.
export function foundationGroupValue(label) {
  if (!label) return null
  const digits = String(label).match(/\d+/)
  return digits ? Number(digits[0]) : null
}

// The most recent move, or null for a student who has never been moved.
//
// A move *between* groups: being put into one in the first place is in the
// history too, and is not something the board should announce - every student
// was put into a group once, and a column that said so about all of them would
// be a column of noise.
//
// A change recorded as direct ("belongs in Group 3", not "moved to it") wipes
// the note: the latest change is what the row describes, and it says there
// was no move.
export function lastGroupMove(history) {
  const moves = (history ?? []).filter((move) => move.from_group)
  const last = moves[moves.length - 1]
  return last && !last.direct ? last : null
}
