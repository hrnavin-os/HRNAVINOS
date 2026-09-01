import { TrendingDown, TrendingUp } from 'lucide-react'

// Each tone carries three things: the tinted plate behind the icon, the pill
// the share rides in, and the rail down the tile's left edge. The rail is what
// makes a row of tiles read as a strip of related figures at a glance - the
// colour is the tile's identity, repeated at a size you can see from across
// the room, which a 32px icon chip alone cannot do.
const TONES = {
  brand: { plate: 'bg-brand-50 text-brand-600', pill: 'bg-brand-50 text-brand-700', rail: 'bg-brand-500' },
  emerald: {
    plate: 'bg-emerald-50 text-emerald-600',
    pill: 'bg-emerald-50 text-emerald-700',
    rail: 'bg-emerald-500',
  },
  red: { plate: 'bg-red-50 text-red-600', pill: 'bg-red-50 text-red-700', rail: 'bg-red-500' },
  amber: { plate: 'bg-amber-50 text-amber-600', pill: 'bg-amber-50 text-amber-700', rail: 'bg-amber-500' },
  slate: { plate: 'bg-slate-100 text-slate-500', pill: 'bg-slate-100 text-slate-600', rail: 'bg-slate-300' },
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
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white pl-4 pr-3.5 py-3 shadow-sm transition-shadow hover:shadow">
      <span className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500">
          {label}
        </p>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.plate}`}>
            <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
        <span
          className={`font-bold leading-none tracking-tight text-slate-900 ${
            isName ? 'line-clamp-2 text-base leading-snug' : 'text-2xl'
          }`}
          title={isName ? value : undefined}
        >
          {value}
        </span>
        {share && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${style.pill}`}>{share}</span>
        )}
      </p>
      {typeof delta === 'number' ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]">
          {/* The movement in its own tinted chip rather than as loose coloured
              text: it is a second, smaller reading of the same figure, and the
              chip is what keeps it from competing with the number above. */}
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-bold ${
              good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            <Arrow className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
            {Math.abs(delta)}%
          </span>
          <span className="truncate text-slate-400">{deltaLabel}</span>
        </p>
      ) : (
        deltaLabel && <p className="mt-2 truncate text-[11px] text-slate-400">{deltaLabel}</p>
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
    <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map(({ label, value, share, icon: Icon, tone = 'brand' }) => {
        const style = TONES[tone] ?? TONES.brand
        return (
          <div key={label} className="flex items-center gap-2.5 px-3.5 py-2.5">
            {Icon && (
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.plate}`}>
                <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-base font-semibold leading-none text-slate-900">{value}</span>
                {share && (
                  <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${style.pill}`}>{share}</span>
                )}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
