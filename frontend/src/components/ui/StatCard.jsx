// Shared stat tile that doubles as a filter/tab control - the Admin board's
// section and stage rows, and the HR Coordinator's student tabs. (The passive
// Dashboard summary tile is components/dashboard/StatCard.)
//
// Each card is a flat wash of its own accent so a row of them scans as a
// legend; the selected one fills solid with white text, so the active choice
// is unmistakable against its pale neighbours. An optional icon means the
// choice isn't carried by colour alone.
//
// Flat, not gradient. Every tile used to be a two-stop gradient with a
// gradient icon plate on top of it, which put four or five separate ramps in
// one 200px band across the top of the board - the first thing the eye landed
// on was the decoration rather than the figures. Solid fills at one step,
// with the accent doing the identifying and the number doing the talking.
const TONE_STYLES = {
  brand: {
    active: 'border-brand-600 bg-brand-600',
    inactive: 'border-brand-100 bg-brand-50/70 hover:bg-brand-50',
    plate: 'bg-brand-600',
    label: 'text-brand-700/80',
    value: 'text-brand-700',
  },
  blue: {
    active: 'border-blue-600 bg-blue-600',
    inactive: 'border-blue-100 bg-blue-50/70 hover:bg-blue-50',
    plate: 'bg-blue-600',
    label: 'text-blue-700/80',
    value: 'text-blue-700',
  },
  emerald: {
    active: 'border-emerald-600 bg-emerald-600',
    inactive: 'border-emerald-100 bg-emerald-50/70 hover:bg-emerald-50',
    plate: 'bg-emerald-600',
    label: 'text-emerald-700/80',
    value: 'text-emerald-700',
  },
  amber: {
    active: 'border-amber-500 bg-amber-500',
    inactive: 'border-amber-100 bg-amber-50/70 hover:bg-amber-50',
    plate: 'bg-amber-500',
    label: 'text-amber-700/80',
    value: 'text-amber-700',
  },
  violet: {
    active: 'border-violet-600 bg-violet-600',
    inactive: 'border-violet-100 bg-violet-50/70 hover:bg-violet-50',
    plate: 'bg-violet-600',
    label: 'text-violet-700/80',
    value: 'text-violet-700',
  },
  rose: {
    active: 'border-rose-600 bg-rose-600',
    inactive: 'border-rose-100 bg-rose-50/70 hover:bg-rose-50',
    plate: 'bg-rose-600',
    label: 'text-rose-700/80',
    value: 'text-rose-700',
  },
  cyan: {
    active: 'border-cyan-600 bg-cyan-600',
    inactive: 'border-cyan-100 bg-cyan-50/70 hover:bg-cyan-50',
    plate: 'bg-cyan-600',
    label: 'text-cyan-700/80',
    value: 'text-cyan-700',
  },
  red: {
    active: 'border-red-600 bg-red-600',
    inactive: 'border-red-100 bg-red-50/70 hover:bg-red-50',
    plate: 'bg-red-600',
    label: 'text-red-700/80',
    value: 'text-red-700',
  },
  slate: {
    active: 'border-slate-600 bg-slate-600',
    inactive: 'border-slate-200 bg-white hover:bg-slate-50',
    plate: 'bg-slate-500',
    label: 'text-slate-500',
    value: 'text-slate-700',
  },
}

// `hint` is a line of qualifying text under the value ("For selected period").
//
// Without `onClick` the card renders as a plain div rather than a button: a
// passive figure should not be focusable, should not announce a pressed state,
// and should not respond to the pointer promising a click that does nothing.
// That is what lets the Payments summary use this card instead of keeping its
// own near-copy of it.
export function StatCard({ label, value, toneName, isActive, onClick, icon: Icon, hint }) {
  const tone = TONE_STYLES[toneName] ?? TONE_STYLES.slate
  const interactive = Boolean(onClick)
  const Wrapper = interactive ? 'button' : 'div'

  return (
    // Fills the row. There was a max-width here to stop two cards taking half
    // the screen each, but the fix for a sparse row is the row's business, not
    // the card's - capped, a full row of four just ended short of the edge with
    // the table beneath running wider than the cards above it.
    // basis-44 keeps them from collapsing the other way when there are six.
    <Wrapper
      {...(interactive
        ? { type: 'button', onClick, 'aria-pressed': isActive }
        : {})}
      // No hover lift. A row of tiles that rise under the pointer is a
      // consumer-dashboard gesture; here the tiles are filter controls sitting
      // directly above the table they filter, and nudging them shifts the one
      // thing the eye is using as an anchor. Colour and the focus ring carry
      // the interaction instead.
      className={`group flex-1 basis-44 rounded-lg border px-3.5 py-2.5 text-left ${
        interactive
          ? 'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
          : ''
      } ${isActive ? `${tone.active} shadow-sm` : tone.inactive}`}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white ${
              isActive ? 'bg-white/20' : tone.plate
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[11px] font-semibold uppercase leading-tight tracking-wide ${
              isActive ? 'text-white/80' : tone.label
            }`}
          >
            {label}
          </p>
          <p
            className={`mt-1 text-xl font-semibold leading-none tabular-nums ${isActive ? 'text-white' : tone.value}`}
          >
            {value}
          </p>
          {hint && (
            <p className={`mt-1 truncate text-[11px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{hint}</p>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
