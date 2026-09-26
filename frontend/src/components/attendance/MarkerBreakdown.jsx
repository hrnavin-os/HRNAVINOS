import { useQueries } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { attendanceBoardService } from '@/services/attendanceBoardService'

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null)

/**
 * One marker, cut by section or by batch: how many of each have signed, been
 * selected, turned up.
 *
 * A row per value with the done share as a bar on a neutral track - one
 * measure, so one hue - and the figures beside it, so nothing rests on judging
 * a length. Clicking a row filters the table below to it; clicking it again
 * lets go. The counts come from the same stats endpoint the cards above read,
 * once per row, under the same key prefix the page refreshes after a mark.
 */
function BreakdownPanel({ title, rows, selected, onSelect, tab }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect('')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800"
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            Show all
          </button>
        )}
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {rows.map((row) => {
          const share = pct(row.yes, row.total)
          const isSelected = selected === row.value
          return (
            <li key={row.value}>
              <button
                type="button"
                onClick={() => onSelect(isSelected ? '' : row.value)}
                aria-pressed={isSelected}
                title={`${row.label}: ${row.yes} of ${row.total} ${tab.yes.toLowerCase()}`}
                className={`block w-full px-4 py-2 text-left transition-colors ${
                  isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'
                } ${selected && !isSelected ? 'opacity-60' : ''}`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-medium text-slate-700">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {row.loading ? (
                      '…'
                    ) : (
                      <>
                        <span className="font-bold text-slate-900">{row.yes}</span> of {row.total}
                        <span className="ml-1.5 inline-block w-9 text-right font-semibold text-slate-700">
                          {share === null ? '—' : `${share}%`}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${share ?? 0}%` }} />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function useSplits(values, toFilters, marker) {
  const results = useQueries({
    queries: values.map((value) => {
      const params = toFilters(value)
      return {
        queryKey: ['induction-attendance-stats', params],
        queryFn: () => attendanceBoardService.getStats(params),
      }
    }),
  })
  return results.map((result) => {
    const split = result.data?.markers?.[marker]
    return { yes: split?.yes ?? 0, total: split?.total ?? 0, loading: result.isLoading }
  })
}

// The two breakdowns for one marker. The section cut is left out when there
// is only one section to cut by - a Section Admin's own, or a roll that has
// only ever had one.
export function MarkerBreakdown({ tab, filters, sectionOptions, batchOptions, onSection, onBatch }) {
  const { section, batch, group } = filters
  const sectionSplits = useSplits(
    sectionOptions.map((option) => option.value),
    (value) => ({ section: value, batch: batch || undefined, group: group || undefined }),
    tab.key,
  )
  const batchSplits = useSplits(
    batchOptions.map((option) => option.value),
    (value) => ({ section: section || undefined, batch: value, group: group || undefined }),
    tab.key,
  )

  const showSections = sectionOptions.length > 1
  const showBatches = batchOptions.length > 0
  if (!showSections && !showBatches) return null

  return (
    <div className={`mb-3 grid gap-3 ${showSections && showBatches ? 'lg:grid-cols-2' : ''}`}>
      {showSections && (
        <BreakdownPanel
          title="By section"
          tab={tab}
          selected={section}
          onSelect={onSection}
          rows={sectionOptions.map((option, index) => ({ ...option, ...sectionSplits[index] }))}
        />
      )}
      {showBatches && (
        <BreakdownPanel
          title="By batch"
          tab={tab}
          selected={batch}
          onSelect={onBatch}
          rows={batchOptions.map((option, index) => ({ ...option, ...batchSplits[index] }))}
        />
      )}
    </div>
  )
}
