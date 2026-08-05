// Passive summary tile for the Dashboard - a figure, not a control. (The
// clickable filter tile that doubles as a tab lives in components/ui/StatCard.)
//
// The tone colours the icon plate and a hairline top accent only. Label and
// value stay in slate text tokens: a light accent (amber, teal) is hard to read
// as text, and identity already comes from the coloured plate beside it.
const TONES = {
  blue: { plate: 'from-blue-500 to-blue-600', accent: 'from-blue-500/70', wash: 'from-blue-50/60' },
  emerald: { plate: 'from-emerald-500 to-emerald-600', accent: 'from-emerald-500/70', wash: 'from-emerald-50/60' },
  pink: { plate: 'from-pink-500 to-pink-600', accent: 'from-pink-500/70', wash: 'from-pink-50/60' },
  amber: { plate: 'from-amber-500 to-amber-600', accent: 'from-amber-500/70', wash: 'from-amber-50/60' },
  teal: { plate: 'from-teal-500 to-teal-600', accent: 'from-teal-500/70', wash: 'from-teal-50/60' },
  orange: { plate: 'from-orange-500 to-orange-600', accent: 'from-orange-500/70', wash: 'from-orange-50/60' },
  violet: { plate: 'from-violet-500 to-violet-600', accent: 'from-violet-500/70', wash: 'from-violet-50/60' },
  red: { plate: 'from-red-500 to-red-600', accent: 'from-red-500/70', wash: 'from-red-50/60' },
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint }) {
  const styles = TONES[tone] ?? TONES.blue

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Hairline accent along the top edge, fading out - carries the tone
          without tinting the whole surface. */}
      <div className={`h-1 bg-linear-to-r ${styles.accent} to-transparent`} />
      {/* Wash behind the value, so the card isn't a flat white rectangle. */}
      <div className={`absolute inset-0 -z-10 bg-linear-to-br ${styles.wash} to-transparent`} />

      <div className="flex items-start gap-4 p-5">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${styles.plate} text-white shadow-sm transition-transform group-hover:scale-105`}
        >
          {Icon && <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

// The one number the dashboard leads with. Deliberately the only tile at this
// size - a second "hero" cancels the first out and nothing reads as the
// headline any more.
export function HeroStat({ label, value, icon: Icon, hint }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-600 via-brand-600 to-brand-700 p-6 shadow-md">
      {/* Oversized watermark of the same icon, clipped by the card. Decorative
          only - the real icon sits in the plate below. */}
      {Icon && (
        <Icon
          className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/10"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <div className="relative flex items-center gap-4">
        {Icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm">
            <Icon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-white/70">{label}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{value}</p>
          {hint && <p className="mt-1 text-sm text-white/70">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
