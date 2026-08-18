import { TrendingDown, TrendingUp } from 'lucide-react'

const TONES = {
  brand: { plate: 'bg-brand-50 text-brand-600', pill: 'bg-brand-50 text-brand-700' },
  emerald: { plate: 'bg-emerald-50 text-emerald-600', pill: 'bg-emerald-50 text-emerald-700' },
  red: { plate: 'bg-red-50 text-red-600', pill: 'bg-red-50 text-red-700' },
  amber: { plate: 'bg-amber-50 text-amber-600', pill: 'bg-amber-50 text-amber-700' },
  slate: { plate: 'bg-slate-100 text-slate-500', pill: 'bg-slate-100 text-slate-600' },
}

/**
 * One headline figure, what share of the whole it is, and which way it is
 * moving.
 *
 * Not a chart: a single number against a total is a number, and a one-slice
 * ring would say the same thing with far more ink. The share rides in a tinted
 * pill on the value's own baseline - it is the comparison the figure is only
 * meaningful against - and the movement sits underneath, where it reads as a
 * footnote to the number rather than as a second number.
 *
 * `delta` is a percentage change against the previous period, and `deltaLabel`
 * says which period that was: an arrow with no period named is a number nobody
 * can check. `invert` is for figures where up is the bad direction - more
 * candidates quitting is not good news, and colouring it green because it rose
 * would be a chart telling a lie.
 */
export function StatTile({ label, value, share, delta, deltaLabel, invert = false, icon: Icon, tone = 'brand' }) {
  const style = TONES[tone] ?? TONES.brand
  // A count gets the big numeral; a name gets a readable size instead. Set at
  // 2xl, "Referral - existing student" wraps to three lines and the tile grows
  // to twice the height of its neighbours.
  const isName = typeof value === 'string'
  const rising = typeof delta === 'number' && delta > 0
  const good = invert ? !rising : rising
  const Arrow = rising ? TrendingUp : TrendingDown

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-400">
          {label}
        </p>
        {Icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.plate}`}>
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-2">
        <span
          className={`font-bold leading-none text-slate-900 ${isName ? 'line-clamp-2 text-lg' : 'text-3xl'}`}
          title={isName ? value : undefined}
        >
          {value}
        </span>
        {share && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.pill}`}>{share}</span>}
      </p>
      {typeof delta === 'number' ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs">
          <Arrow
            className={`h-3.5 w-3.5 shrink-0 ${good ? 'text-emerald-600' : 'text-red-600'}`}
            strokeWidth={2.5}
            aria-hidden="true"
          />
          <span className={`font-semibold ${good ? 'text-emerald-600' : 'text-red-600'}`}>
            {Math.abs(delta)}%
          </span>
          <span className="truncate text-slate-400">{deltaLabel}</span>
        </p>
      ) : (
        deltaLabel && <p className="mt-2.5 truncate text-xs text-slate-400">{deltaLabel}</p>
      )}
    </div>
  )
}

/**
 * The strip of smaller figures along the foot of a panel - each one a slice of
 * the same total the panel above is about.
 *
 * Divided by hairlines rather than boxed as three cards: they belong to the
 * panel they sit in, and three more cards inside a card reads as a second
 * dashboard growing out of the first.
 */
export function MiniStatStrip({ items }) {
  return (
    <div className="grid divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(({ label, value, share, icon: Icon, tone = 'brand' }) => {
        const style = TONES[tone] ?? TONES.brand
        return (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            {Icon && (
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.plate}`}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-bold leading-none text-slate-900">{value}</span>
                {share && <span className={`text-xs font-semibold ${style.pill} bg-transparent`}>{share}</span>}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
