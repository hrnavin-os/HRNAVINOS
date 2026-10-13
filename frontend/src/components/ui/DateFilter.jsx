import { FilterShell, MenuOption } from '@/components/ui/FilterDropdown'
import { formatDate } from '@/utils/formatters'
import { PAST_PRESETS } from '@/utils/datePresets'

// Local calendar day as YYYY-MM-DD. Deliberately not toISOString(), which
// converts to UTC first and hands back yesterday for anyone east of Greenwich
// - which is everyone using this.
function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function rangeLabel({ from, to, preset }, presets) {
  const named = presets.find((item) => item.key === preset)
  if (named) return named.label
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to)}`
}

/**
 * Date filter for a board's filter row: a handful of presets - the past-facing
 * ones unless `presets` passes others - or a From/To pair for anything
 * they don't cover. Distinct from DateRangeFilter, which is the
 * plain two-input popover the Admin and Finance pages hang off a secondary
 * button - this one wears FilterShell's chrome so it belongs in a row of
 * filter dropdowns, and leads with the windows worth one click.
 *
 * `value` is `{ from, to, preset }` or null, where from/to are YYYY-MM-DD and
 * either may be missing - an open-ended "everything since March" is a real
 * question, and demanding both ends would make it two clicks in a calendar for
 * a bound nobody cares about.
 */
export function DateFilter({ label = 'Date', value, onChange, grow = false, presets = PAST_PRESETS }) {
  const from = value?.from ?? ''
  const to = value?.to ?? ''

  // A preset with no range is a choice a window can't express - the
  // schedule's "Not scheduled" - and is read back off `preset` alone.
  function choose(preset) {
    if (!preset.range) {
      onChange({ from: null, to: null, preset: preset.key })
      return
    }
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
      activeLabel={value ? rangeLabel(value, presets) : null}
      onClear={() => onChange(null)}
      grow={grow}
      menuWidth={272}
    >
      {({ close }) => (
        <>
          <MenuOption label={`All ${label}s`} isSelected={!value} onClick={() => { onChange(null); close() }} />
          {presets.map((preset) => (
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
