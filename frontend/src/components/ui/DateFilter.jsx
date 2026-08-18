import { FilterShell, MenuOption } from '@/components/ui/FilterDropdown'
import { formatDate } from '@/utils/formatters'

// Local calendar day as YYYY-MM-DD. Deliberately not toISOString(), which
// converts to UTC first and hands back yesterday for anyone east of Greenwich
// - which is everyone using this.
function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function daysAgo(days) {
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
const PRESETS = [
  { key: 'today', label: 'Today', range: () => [daysAgo(0), daysAgo(0)] },
  { key: 'yesterday', label: 'Yesterday', range: () => [daysAgo(-1), daysAgo(-1)] },
  { key: 'last_7', label: 'Last 7 days', range: () => [daysAgo(-6), daysAgo(0)] },
  { key: 'this_month', label: 'This month', range: () => month(0) },
  { key: 'last_month', label: 'Last month', range: () => month(-1) },
]

function rangeLabel({ from, to, preset }) {
  const named = PRESETS.find((item) => item.key === preset)
  if (named) return named.label
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to)}`
}

/**
 * Date filter for the board's filter row: five presets, or a From/To pair for
 * anything they don't cover.
 *
 * `value` is `{ from, to, preset }` or null, where from/to are YYYY-MM-DD and
 * either may be missing - an open-ended "everything since March" is a real
 * question, and demanding both ends would make it two clicks in a calendar for
 * a bound nobody cares about.
 */
export function DateFilter({ label = 'Date', value, onChange, grow = false }) {
  const from = value?.from ?? ''
  const to = value?.to ?? ''

  function choose(preset) {
    const [start, end] = preset.range()
    onChange({ from: isoDay(start), to: isoDay(end), preset: preset.key })
  }

  // A typed bound drops the preset: the range is no longer "This month" once
  // one of its ends has been moved, and labelling it so would be a lie.
  function setBound(key, day) {
    const next = { from, to, [key]: day, preset: null }
    onChange(next.from || next.to ? next : null)
  }

  return (
    <FilterShell
      label={label}
      activeLabel={value ? rangeLabel(value) : null}
      onClear={() => onChange(null)}
      grow={grow}
      menuWidth={272}
    >
      {({ close }) => (
        <>
          <MenuOption label={`All ${label}s`} isSelected={!value} onClick={() => { onChange(null); close() }} />
          {PRESETS.map((preset) => (
            <MenuOption
              key={preset.key}
              label={preset.label}
              isSelected={value?.preset === preset.key}
              onClick={() => {
                choose(preset)
                close()
              }}
            />
          ))}
          {/* Stays open while these are being filled: a range takes two
              answers, and closing on the first would make it two trips. */}
          <div className="mt-1 border-t border-slate-100 px-2.5 pb-1.5 pt-2">
            <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Custom range</p>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setBound('from', event.target.value)}
                aria-label={`${label} from`}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
              />
              <span className="shrink-0 text-xs text-slate-400">to</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setBound('to', event.target.value)}
                aria-label={`${label} to`}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
              />
            </div>
          </div>
        </>
      )}
    </FilterShell>
  )
}
