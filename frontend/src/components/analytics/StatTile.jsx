const TONES = {
  brand: { wash: 'from-brand-50/70', plate: 'bg-brand-100 text-brand-600', pill: 'bg-brand-100 text-brand-700' },
  emerald: {
    wash: 'from-emerald-50/70',
    plate: 'bg-emerald-100 text-emerald-600',
    pill: 'bg-emerald-100 text-emerald-700',
  },
  red: { wash: 'from-red-50/70', plate: 'bg-red-100 text-red-600', pill: 'bg-red-100 text-red-700' },
  amber: { wash: 'from-amber-50/70', plate: 'bg-amber-100 text-amber-600', pill: 'bg-amber-100 text-amber-700' },
  slate: { wash: 'from-slate-100/70', plate: 'bg-slate-100 text-slate-500', pill: 'bg-slate-100 text-slate-600' },
}

/**
 * A single number, what share of the whole it is, and nothing else.
 *
 * Not a chart: one figure against a total is a figure, and a one-slice donut
 * would say the same thing with far more ink. The share sits in a tinted pill
 * on the same baseline as the value rather than as a line of text underneath -
 * it is the comparison the number is only meaningful against, so it belongs
 * beside it, not in a footnote.
 */
export function StatTile({ label, value, share, hint, icon: Icon, tone = 'brand' }) {
  const style = TONES[tone] ?? TONES.brand
  // A count gets the big numeral; a name gets a readable size instead. Set at
  // 2xl, "Referral - existing student" wraps to three lines and the tile grows
  // to twice the height of its neighbours.
  const isName = typeof value === 'string'
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* A wash behind the figure rather than a flat white card, so a row of
          these reads as related things and not as empty boxes. */}
      <div className={`absolute inset-0 -z-10 bg-linear-to-br ${style.wash} to-transparent`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-2">
            <span
              className={`font-bold leading-tight text-slate-900 ${
                isName ? 'line-clamp-2 text-sm' : 'text-2xl leading-none'
              }`}
              title={isName ? value : undefined}
            >
              {value}
            </span>
            {share && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.pill}`}>{share}</span>
            )}
          </p>
          {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.plate}`}>
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  )
}
