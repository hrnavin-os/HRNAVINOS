// Where a candidate stands after the induction call.
//
// Grouped rather than listed flat, and the group is what carries the colour:
// nineteen dispositions each with their own hue would be a colour wheel, not a
// signal. What a reader actually needs from across the table is which of six
// things happened - completed, scheduled, absent, unreachable, moved, quit -
// and the label says the rest. The menu shows no group headings; the colour is
// the split.
//
// The list is data, not an enum. It's operational and gets added to, so the
// stored value is plain text (InductionEntry.call_remark) and a new option is
// a line here rather than a migration.
export const REMARK_GROUPS = [
  {
    key: 'done',
    label: 'Completed',
    tone: 'emerald',
    // Selected-cell styling, then the row inside the open menu.
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    options: ['Induction Call Completed - Gmeet', 'Induction Call Completed - Phone Call'],
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    tone: 'blue',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    options: [
      'Induction Call Scheduled - Today',
      'Induction Call Scheduled - Tomorrow',
      'Induction Call Scheduled - Upcoming Date',
    ],
  },
  {
    key: 'absent',
    label: 'Not attended',
    tone: 'amber',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    options: [
      'Not attended - Induction session',
      'Not available - Foundation session',
      'Induction Not Attended - Foundation Session Attended',
    ],
  },
  {
    key: 'unreachable',
    label: 'Not reached',
    tone: 'slate',
    // Grey rather than another warm hue: nobody was reached at all, which is a
    // different thing from someone who was reached and didn't turn up.
    badge: 'border-slate-300 bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    text: 'text-slate-600',
    options: [
      "Didn't Pick Up - Attempt 1",
      "Didn't Pick Up - Attempt 2",
      "Didn't Pick Up - Attempt 3",
      "Didn't Pick Up - Informed sales team",
      'Switchoff / Out of service / Not reachable',
    ],
  },
  {
    key: 'moved',
    label: 'Moved',
    tone: 'violet',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
    text: 'text-violet-700',
    options: [
      'Moved to Group 2 foundation session',
      'Moved to Group 3 foundation session',
      'Moved to next batch',
    ],
  },
  {
    key: 'quit',
    label: 'Quit',
    tone: 'red',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
    text: 'text-red-700',
    options: [
      'Quit - Before Induction Call',
      'Quit - After Induction Call (Foundation Session Not Attended)',
      'Quit - After Foundation Session',
    ],
  },
]

// value -> its group, so a cell can colour itself without knowing the grouping.
// Built once rather than searched per render, since every row does this lookup.
export const REMARK_GROUP_BY_VALUE = Object.fromEntries(
  REMARK_GROUPS.flatMap((group) => group.options.map((option) => [option, group])),
)
