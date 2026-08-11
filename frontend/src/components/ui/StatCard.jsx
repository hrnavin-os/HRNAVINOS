import { Check } from 'lucide-react'

// Shared stat tile that doubles as a filter/tab control - the Admin board's
// section and stage rows, and the HR Coordinator's student tabs. (The passive
// Dashboard summary tile is components/dashboard/StatCard.)
//
// Each card is a soft wash of its own accent so a row of them scans as a
// legend; the selected one inverts to a solid gradient with white text, so the
// active choice is unmistakable against its pastel neighbours. An optional
// icon means the choice isn't carried by colour alone.
const TONE_STYLES = {
  brand: {
    active: 'border-brand-700 bg-linear-to-br from-brand-500 to-brand-700',
    inactive: 'border-brand-100 bg-linear-to-br from-brand-50 to-white hover:from-brand-100',
    plate: 'bg-linear-to-br from-brand-500 to-brand-700',
    label: 'text-brand-700/80',
    value: 'text-brand-700',
  },
  blue: {
    active: 'border-blue-700 bg-linear-to-br from-blue-500 to-blue-700',
    inactive: 'border-blue-100 bg-linear-to-br from-blue-50 to-white hover:from-blue-100',
    plate: 'bg-linear-to-br from-blue-500 to-blue-700',
    label: 'text-blue-700/80',
    value: 'text-blue-700',
  },
  emerald: {
    active: 'border-emerald-700 bg-linear-to-br from-emerald-500 to-emerald-700',
    inactive: 'border-emerald-100 bg-linear-to-br from-emerald-50 to-white hover:from-emerald-100',
    plate: 'bg-linear-to-br from-emerald-500 to-emerald-700',
    label: 'text-emerald-700/80',
    value: 'text-emerald-700',
  },
  amber: {
    active: 'border-amber-600 bg-linear-to-br from-amber-400 to-amber-600',
    inactive: 'border-amber-100 bg-linear-to-br from-amber-50 to-white hover:from-amber-100',
    plate: 'bg-linear-to-br from-amber-400 to-amber-600',
    label: 'text-amber-700/80',
    value: 'text-amber-700',
  },
  violet: {
    active: 'border-violet-700 bg-linear-to-br from-violet-500 to-violet-700',
    inactive: 'border-violet-100 bg-linear-to-br from-violet-50 to-white hover:from-violet-100',
    plate: 'bg-linear-to-br from-violet-500 to-violet-700',
    label: 'text-violet-700/80',
    value: 'text-violet-700',
  },
  rose: {
    active: 'border-rose-700 bg-linear-to-br from-rose-500 to-rose-700',
    inactive: 'border-rose-100 bg-linear-to-br from-rose-50 to-white hover:from-rose-100',
    plate: 'bg-linear-to-br from-rose-500 to-rose-700',
    label: 'text-rose-700/80',
    value: 'text-rose-700',
  },
  cyan: {
    active: 'border-cyan-700 bg-linear-to-br from-cyan-500 to-cyan-700',
    inactive: 'border-cyan-100 bg-linear-to-br from-cyan-50 to-white hover:from-cyan-100',
    plate: 'bg-linear-to-br from-cyan-500 to-cyan-700',
    label: 'text-cyan-700/80',
    value: 'text-cyan-700',
  },
  red: {
    active: 'border-red-700 bg-linear-to-br from-red-500 to-red-700',
    inactive: 'border-red-100 bg-linear-to-br from-red-50 to-white hover:from-red-100',
    plate: 'bg-linear-to-br from-red-500 to-red-700',
    label: 'text-red-700/80',
    value: 'text-red-700',
  },
  slate: {
    active: 'border-slate-700 bg-linear-to-br from-slate-500 to-slate-700',
    inactive: 'border-slate-200 bg-linear-to-br from-slate-50 to-white hover:from-slate-100',
    plate: 'bg-linear-to-br from-slate-500 to-slate-700',
    label: 'text-slate-600',
    value: 'text-slate-700',
  },
}

export function StatCard({ label, value, toneName, isActive, onClick, icon: Icon }) {
  const tone = TONE_STYLES[toneName] ?? TONE_STYLES.slate

  return (
    // Grows to share the row, but capped. Uncapped, a board with two sections
    // gave each card half the screen to show a two-digit number, and the row
    // read as two empty panels rather than a set of counts. basis-44 keeps them
    // from collapsing when there are six.
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`group max-w-60 flex-1 basis-44 rounded-xl border px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        isActive ? `${tone.active} shadow-md` : tone.inactive
      }`}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform group-hover:scale-105 ${
              isActive ? 'bg-white/20' : tone.plate
            }`}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[11px] font-semibold uppercase tracking-wide leading-tight ${
              isActive ? 'text-white/75' : tone.label
            }`}
          >
            {label}
          </p>
          <p
            className={`mt-1 text-2xl font-bold leading-none tabular-nums ${isActive ? 'text-white' : tone.value}`}
          >
            {value}
          </p>
        </div>
        {/* Confirms the selection without relying on the fill alone, which is
            the only thing separating active from inactive otherwise. */}
        {isActive && (
          <Check className="h-4 w-4 shrink-0 self-start text-white/70" strokeWidth={3} aria-hidden="true" />
        )}
      </div>
    </button>
  )
}
