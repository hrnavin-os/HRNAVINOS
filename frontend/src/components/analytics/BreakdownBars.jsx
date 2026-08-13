// Horizontal bars for "how many of each", sorted high to low.
//
// Horizontal rather than vertical because the labels are long - "Experienced i
// HR + Career Gap", "Switch Off / Out Of Service / Not Reachable" - and
// vertical columns would either rotate them 45 degrees or truncate them.
//
// One hue for every bar, not a light-to-dark ramp. Categories and remarks are
// nominal: shading them by size would encode the bar's length twice and spend
// the only free channel on something the length already says. Where a bar
// carries its own meaning (the remark groups, which are already colour-coded
// across the app) the caller passes a colour per row instead.
//
// Every value is printed at the bar's end, so nothing is reachable only by
// hovering, and the table beneath carries the same numbers again.
export function BreakdownBars({ items, valueKey = 'count', emptyMessage = 'Nothing to show yet.' }) {
  if (!items.length) {
    return <p className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  // Scaled against the largest bar rather than the total: this is a magnitude
  // comparison, not a part-to-whole, and scaling to the total leaves every bar
  // a stub as soon as one value dominates.
  const max = Math.max(...items.map((item) => item[valueKey]), 1)

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const value = item[valueKey]
        const width = Math.max((value / max) * 100, value > 0 ? 1.5 : 0)
        return (
          <li key={item.value} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-xs font-medium text-slate-600" title={item.value}>
              {item.value}
            </span>
            {/* The track is a hairline off the surface, so it reads as the
                scale rather than as a second bar. */}
            <span className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{ width: `${width}%`, backgroundColor: item.color ?? 'var(--color-brand-600)' }}
              />
            </span>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-900">{value}</span>
          </li>
        )
      })}
    </ul>
  )
}
