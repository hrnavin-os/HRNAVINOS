// Every chip carries a hairline ring of its own hue as well as the wash.
// Against a white row a pastel fill alone has almost no edge, and a column of
// them reads as smudges; the ring is what makes each one a discrete token at
// a glance. Text sits at 700 and the ring at 200 - measured so the label
// clears 4.5:1 on its own fill in all nine tones.
const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  pink: 'bg-pink-50 text-pink-700 ring-pink-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const OUTLINE_TONES = {
  slate: 'text-slate-600 ring-slate-300',
  green: 'text-green-600 ring-green-300',
  amber: 'text-amber-600 ring-amber-300',
  red: 'text-red-600 ring-red-300',
  blue: 'text-blue-600 ring-blue-300',
  violet: 'text-violet-600 ring-violet-300',
  teal: 'text-teal-600 ring-teal-300',
  pink: 'text-pink-600 ring-pink-300',
  emerald: 'text-emerald-600 ring-emerald-300',
}

// whitespace-nowrap because a badge is one atomic label - letting a
// two-word value like "C Section" or "Batch Confirmation" break across
// lines in a narrow column reads as two separate tags.
//
// gap-1 so a badge given a leading icon doesn't run it into the text. Costs
// nothing on the text-only badges that are most of them, since there's no
// second child to put a gap between.
//
// A rounded rectangle, not a pill: these sit in table cells beside inputs and
// buttons that are 6px-rounded, and a full pill among them is the one shape
// in the row that belongs to a different UI. 11px uppercase-adjacent sizing
// keeps a chip visibly subordinate to the value in the cell next to it.
const SHAPE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset'

export function Badge({ tone = 'slate', outline = false, children }) {
  return (
    <span className={`${SHAPE} ${outline ? `bg-white ${OUTLINE_TONES[tone]}` : TONES[tone]}`}>
      {children}
    </span>
  )
}
