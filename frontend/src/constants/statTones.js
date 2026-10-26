// The one look every summary card in the ERP wears: the Foundation stage row's.
//
// A card is a flat wash of its own accent, with the label and the figure in
// that accent's dark step, so a row of them scans as a legend. A card that is
// switched on fills solid with white text, so the active choice is
// unmistakable against its pale neighbours. StatCard, the Statistics tiles and
// their foot strips, and the Dashboard's KPIs all read this table, so a tone
// means the same colour on every page it appears on.
//
// `surface` is the resting card and `hover` is added only when the card is a
// button - a passive figure shouldn't respond to the pointer. `plate` is the
// icon chip, solid at full strength because it is small enough to carry it.
// Slate is the neutral one: a white card, for figures that are "the rest".
//
// Full class strings, never assembled from the tone name: Tailwind only
// generates the classes it can find written out in the source.
export const STAT_TONES = {
  brand: {
    active: 'border-brand-600 bg-brand-600',
    surface: 'border-brand-100 bg-brand-50/70',
    hover: 'hover:bg-brand-50',
    plate: 'bg-brand-600',
    label: 'text-brand-700/80',
    value: 'text-brand-700',
  },
  blue: {
    active: 'border-blue-600 bg-blue-600',
    surface: 'border-blue-100 bg-blue-50/70',
    hover: 'hover:bg-blue-50',
    plate: 'bg-blue-600',
    label: 'text-blue-700/80',
    value: 'text-blue-700',
  },
  emerald: {
    active: 'border-emerald-600 bg-emerald-600',
    surface: 'border-emerald-100 bg-emerald-50/70',
    hover: 'hover:bg-emerald-50',
    plate: 'bg-emerald-600',
    label: 'text-emerald-700/80',
    value: 'text-emerald-700',
  },
  amber: {
    active: 'border-amber-500 bg-amber-500',
    surface: 'border-amber-100 bg-amber-50/70',
    hover: 'hover:bg-amber-50',
    plate: 'bg-amber-500',
    label: 'text-amber-700/80',
    value: 'text-amber-700',
  },
  orange: {
    active: 'border-orange-600 bg-orange-600',
    surface: 'border-orange-100 bg-orange-50/70',
    hover: 'hover:bg-orange-50',
    plate: 'bg-orange-600',
    label: 'text-orange-700/80',
    value: 'text-orange-700',
  },
  violet: {
    active: 'border-violet-600 bg-violet-600',
    surface: 'border-violet-100 bg-violet-50/70',
    hover: 'hover:bg-violet-50',
    plate: 'bg-violet-600',
    label: 'text-violet-700/80',
    value: 'text-violet-700',
  },
  rose: {
    active: 'border-rose-600 bg-rose-600',
    surface: 'border-rose-100 bg-rose-50/70',
    hover: 'hover:bg-rose-50',
    plate: 'bg-rose-600',
    label: 'text-rose-700/80',
    value: 'text-rose-700',
  },
  cyan: {
    active: 'border-cyan-600 bg-cyan-600',
    surface: 'border-cyan-100 bg-cyan-50/70',
    hover: 'hover:bg-cyan-50',
    plate: 'bg-cyan-600',
    label: 'text-cyan-700/80',
    value: 'text-cyan-700',
  },
  red: {
    active: 'border-red-600 bg-red-600',
    surface: 'border-red-100 bg-red-50/70',
    hover: 'hover:bg-red-50',
    plate: 'bg-red-600',
    label: 'text-red-700/80',
    value: 'text-red-700',
  },
  slate: {
    active: 'border-slate-600 bg-slate-600',
    surface: 'border-slate-200 bg-white',
    hover: 'hover:bg-slate-50',
    plate: 'bg-slate-500',
    label: 'text-slate-500',
    value: 'text-slate-700',
  },
}

export const statTone = (name) => STAT_TONES[name] ?? STAT_TONES.slate
