import { Children } from 'react'

// Columns follow the number of tiles rather than being fixed at four. Fixed,
// the two-tile section sat in the left half of the page with the right half
// blank, which read as tiles failing to load rather than as a section that only
// has two figures in it.
//
// Spelled out rather than built as `grid-cols-${n}`: Tailwind scans source for
// complete class names, so an interpolated one is never generated.
const COLUMNS = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
}

export function StatSection({ title, children }) {
  // Four is also the fallback for any larger section, which then wraps.
  const columns = COLUMNS[Children.count(children)] ?? 'sm:grid-cols-2 lg:grid-cols-4'

  return (
    <section className="mb-8 last:mb-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className={`grid grid-cols-1 gap-4 ${columns}`}>{children}</div>
    </section>
  )
}
