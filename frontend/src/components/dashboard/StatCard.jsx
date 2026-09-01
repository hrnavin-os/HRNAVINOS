// Passive summary tile for the Dashboard - a figure, not a control. (The
// clickable filter tile that doubles as a tab lives in components/ui/StatCard.)
//
// The tone colours the icon plate and a hairline top accent only. Label and
// value stay in slate text tokens: a light accent (amber, teal) is hard to read
// as text, and identity already comes from the coloured plate beside it.
//
// Solid accents, no washes or gradients. A dashboard is a dozen of these in a
// grid, and a dozen tinted, gradient-washed rectangles turn a page of figures
// into a page of colour - the accent's job is to tell one tile from the next,
// which one step of one hue does on its own.
const TONES = {
  blue: { plate: 'bg-blue-600', accent: 'bg-blue-500' },
  emerald: { plate: 'bg-emerald-600', accent: 'bg-emerald-500' },
  pink: { plate: 'bg-pink-600', accent: 'bg-pink-500' },
  amber: { plate: 'bg-amber-500', accent: 'bg-amber-400' },
  teal: { plate: 'bg-teal-600', accent: 'bg-teal-500' },
  orange: { plate: 'bg-orange-600', accent: 'bg-orange-500' },
  violet: { plate: 'bg-violet-600', accent: 'bg-violet-500' },
  red: { plate: 'bg-red-600', accent: 'bg-red-500' },
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint }) {
  const styles = TONES[tone] ?? TONES.blue

  return (
    // Static. These are read, not operated - a tile that lifts and deepens its
    // shadow under the pointer is promising a click that never comes.
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Hairline accent along the top edge - carries the tone without tinting
          the whole surface. */}
      <div className={`h-0.5 ${styles.accent}`} />

      <div className="flex items-start gap-3.5 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white ${styles.plate}`}>
          {Icon && <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

// The one number the dashboard leads with. Deliberately the only tile at this
// size - a second "hero" cancels the first out and nothing reads as the
// headline any more.
//
// The single gradient left in the app, and it earns its keep: one filled panel
// at the top of the landing page is what gives the dashboard a masthead. The
// watermark went - at 160px it was competing with the figure it sat behind.
export function HeroStat({ label, value, icon: Icon, hint }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-brand-600 to-brand-700 p-5 shadow-sm">
      <div className="relative flex items-center gap-4">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{label}</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-white">{value}</p>
          {hint && <p className="mt-1 text-sm text-white/75">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
