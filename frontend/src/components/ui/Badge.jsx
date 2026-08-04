const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  teal: 'bg-teal-100 text-teal-700',
  pink: 'bg-pink-100 text-pink-700',
  emerald: 'bg-emerald-100 text-emerald-700',
}

const OUTLINE_TONES = {
  slate: 'border-slate-300 text-slate-600',
  green: 'border-green-300 text-green-600',
  amber: 'border-amber-300 text-amber-600',
  red: 'border-red-300 text-red-600',
  blue: 'border-blue-300 text-blue-600',
  violet: 'border-violet-300 text-violet-600',
  teal: 'border-teal-300 text-teal-600',
  pink: 'border-pink-300 text-pink-600',
  emerald: 'border-emerald-300 text-emerald-600',
}

// whitespace-nowrap because a badge is one atomic label - letting a
// two-word value like "C Section" or "Batch Confirmation" break across
// lines in a narrow column reads as two separate tags.
export function Badge({ tone = 'slate', outline = false, children }) {
  if (outline) {
    return (
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-md border bg-white px-2.5 py-0.5 text-xs font-medium ${OUTLINE_TONES[tone]}`}
      >
        {children}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
