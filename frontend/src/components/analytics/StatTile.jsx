import { TrendingDown, TrendingUp } from 'lucide-react'
import { statTone } from '@/constants/statTones'

/**
 * One headline figure, what share of the whole it is, and which way it is
 * moving.
 *
 * Not a chart: a single number against a total is a number, and a one-slice
 * ring would say the same thing with far more ink. The share rides in a pill
 * on the value's own baseline - it is the comparison the figure is only
 * meaningful against - and the movement sits underneath, where it reads as a
 * footnote to the number rather than as a second number.
 *
 * `delta` is a percentage change against the previous period, and `deltaLabel`
 * says which period that was: an arrow with no period named is a number nobody
 * can check. `invert` is for figures where up is the bad direction - more
 * candidates quitting is not good news, and colouring it green because it rose
 * would be a chart telling a lie.
 *
 * `onClick` makes the tile a filter: clicking it narrows the board below to
 * the figure it shows. `active` marks the one currently doing so.
 *
 * Dressed like every other summary card in the ERP (constants/statTones): a
 * wash of its tone with the label and figure in the tone's dark step, filling
 * solid with white text while it is the active filter.
 */
export function StatTile({
  label,
  value,
  share,
  delta,
  deltaLabel,
  invert = false,
  icon: Icon,
  tone = 'brand',
  onClick,
  active = false,
}) {
  const style = statTone(tone)
  const on = Boolean(onClick) && active
  // A count gets the big numeral; a name gets a readable size instead. Set at
  // 2xl, "Referral - existing student" wraps to three lines and the tile grows
  // to twice the height of its neighbours.
  const isName = typeof value === 'string'
  const rising = typeof delta === 'number' && delta > 0
  const good = invert ? !rising : rising
  const Arrow = rising ? TrendingUp : TrendingDown

  // The pills sit on the wash, so they are white to stand off it; on a
  // solid tile they go translucent instead, like the label and the figure.
  const pill = on ? 'bg-white/20 text-white' : 'bg-white ring-1 ring-black/5'

  // A real button when it filters, so it is reachable by keyboard and says
  // whether it is pressed; a plain box otherwise.
  const Tag = onClick ? 'button' : 'div'

  // Spans styled as blocks rather than <p>/<div>: a <button> may only hold
  // phrasing content, and the same markup has to serve both.
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick, 'aria-pressed': active } : {})}
      className={`block w-full rounded-lg border px-3.5 py-3 text-left ${
        onClick
          ? 'cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
          : ''
      } ${on ? `${style.active} shadow-sm` : `${style.surface} ${onClick ? style.hover : ''}`}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          className={`min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wide ${
            on ? 'text-white/80' : style.label
          }`}
        >
          {label}
        </span>
        {Icon && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${
              on ? 'bg-white/20' : style.plate
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
        <span
          className={`font-semibold leading-none tracking-tight tabular-nums ${on ? 'text-white' : style.value} ${
            isName ? 'line-clamp-2 text-base leading-snug' : 'text-2xl'
          }`}
          title={isName ? value : undefined}
        >
          {value}
        </span>
        {share && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${pill} ${on ? '' : style.value}`}>
            {share}
          </span>
        )}
      </span>
      {typeof delta === 'number' ? (
        <span className="mt-2 flex items-center gap-1.5 text-[11px]">
          {/* The movement in its own chip rather than as loose coloured text:
              it is a second, smaller reading of the same figure, and the chip
              is what keeps it from competing with the number above. */}
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-bold ${pill} ${
              on ? '' : good ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            <Arrow className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
            {Math.abs(delta)}%
          </span>
          <span className={`truncate ${on ? 'text-white/70' : 'text-slate-500'}`}>{deltaLabel}</span>
        </span>
      ) : (
        deltaLabel && (
          <span className={`mt-2 block truncate text-[11px] ${on ? 'text-white/70' : 'text-slate-500'}`}>
            {deltaLabel}
          </span>
        )
      )}
    </Tag>
  )
}

/**
 * The strip of smaller figures along the foot of a panel - each one a slice of
 * the same total the panel above is about.
 *
 * Small washed cards in the same tones as the tiles above, so a figure keeps
 * its colour from the headline row down to the foot of the panel.
 */
export function MiniStatStrip({ items }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map(({ label, value, share, icon: Icon, tone = 'brand' }) => {
        const style = statTone(tone)
        return (
          <div key={label} className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${style.surface}`}>
            {Icon && (
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${style.plate}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className={`truncate text-[11px] font-semibold uppercase tracking-wide ${style.label}`}>{label}</p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className={`text-base font-semibold leading-none tabular-nums ${style.value}`}>{value}</span>
                {share && (
                  <span
                    className={`rounded bg-white px-1 py-0.5 text-[10px] font-bold ring-1 ring-black/5 ${style.value}`}
                  >
                    {share}
                  </span>
                )}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
