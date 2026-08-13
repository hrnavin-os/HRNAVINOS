// Where a candidate stands after the induction call.
//
// Grouped rather than listed flat, and the group is what carries the colour:
// thirty-one dispositions each with their own hue would be a colour wheel, not
// a signal. What a reader actually needs from across the table is which of five
// things happened - done, scheduled, chasing, quit, moved - and the label says
// the rest.
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
    options: [
      'Induction Call Done- Phone',
      'Phone Call Done-Day 1',
      'Phone Call Done-Day 2',
      'Phone Call Done-Day 3',
      'Will Join - Induction Call Completed',
      'Induction Call Finished-Discuss',
    ],
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    tone: 'blue',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
    options: [
      'Call Scheduled Today',
      'Call Scheduled Tomorrow',
      'Call Scheduled Day After Tomorrow',
      'Call Scheduled Upcoming Dates',
    ],
  },
  {
    key: 'chasing',
    label: 'Not reached',
    tone: 'amber',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    options: [
      'Informed Sales Team to Connect',
      "Didn't Pick Call",
      'Switch Off / Out Of Service / Not Reachable',
      "Didn't Attend Induction call",
    ],
  },
  {
    key: 'moved',
    label: 'Moved',
    tone: 'violet',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
    options: ['Move to Next Batch'],
  },
  {
    key: 'quit',
    label: 'Quit',
    tone: 'red',
    badge: 'border-red-200 bg-red-50 text-red-700',
    dot: 'bg-red-500',
    options: [
      'Quit - Before Induction Call',
      'QUIT - Induction call',
      'Quit - After induction call',
      'Before Class QUIT',
      'QUIT-Refund Done',
      'DAY-1 QUIT',
      'DAY-2 QUIT',
      'DAY-3 QUIT',
      'DAY-4 QUIT',
      'DAY-5 QUIT',
      'Quit - G1 - Before Demo Class',
      'Quit-G1-After Demo Class',
      'Quit-G2-Before Demo Class',
      'Quit-G2-After Demo Class',
      'Quit-G3-Before Demo Class Quit',
      'Quit-G3 - After Demo Class Quit',
    ],
  },
]

// value -> its group, so a cell can colour itself without knowing the grouping.
// Built once rather than searched per render, since every row does this lookup.
export const REMARK_GROUP_BY_VALUE = Object.fromEntries(
  REMARK_GROUPS.flatMap((group) => group.options.map((option) => [option, group])),
)
