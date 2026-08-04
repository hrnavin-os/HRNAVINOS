// Shared stat-card tile used as both a summary and a filter/tab control -
// the Admin board's section and stage rows, and the HR Coordinator's student
// tabs. Each card is a soft pastel wash of its own accent, with the label AND
// the value both carrying that accent, so the whole card reads as one
// coloured unit and a row of them scans as a legend. The selected card
// inverts to a solid fill with white text, so the active choice is
// unmistakable against its pastel neighbours.
const TONE_STYLES = {
  brand: {
    active: 'border-brand-600 bg-brand-600',
    inactive: 'border-brand-100 bg-brand-50 hover:bg-brand-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-brand-600',
    inactiveLabel: 'text-brand-600',
  },
  blue: {
    active: 'border-blue-500 bg-blue-500',
    inactive: 'border-blue-100 bg-blue-50 hover:bg-blue-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-blue-600',
    inactiveLabel: 'text-blue-600',
  },
  emerald: {
    active: 'border-emerald-500 bg-emerald-500',
    inactive: 'border-emerald-100 bg-emerald-50 hover:bg-emerald-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-emerald-600',
    inactiveLabel: 'text-emerald-600',
  },
  amber: {
    active: 'border-amber-500 bg-amber-500',
    inactive: 'border-amber-100 bg-amber-50 hover:bg-amber-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-amber-600',
    inactiveLabel: 'text-amber-600',
  },
  violet: {
    active: 'border-violet-500 bg-violet-500',
    inactive: 'border-violet-100 bg-violet-50 hover:bg-violet-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-violet-600',
    inactiveLabel: 'text-violet-600',
  },
  rose: {
    active: 'border-rose-500 bg-rose-500',
    inactive: 'border-rose-100 bg-rose-50 hover:bg-rose-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-rose-600',
    inactiveLabel: 'text-rose-600',
  },
  cyan: {
    active: 'border-cyan-500 bg-cyan-500',
    inactive: 'border-cyan-100 bg-cyan-50 hover:bg-cyan-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-cyan-600',
    inactiveLabel: 'text-cyan-600',
  },
  red: {
    active: 'border-red-500 bg-red-500',
    inactive: 'border-red-100 bg-red-50 hover:bg-red-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-red-600',
    inactiveLabel: 'text-red-600',
  },
  slate: {
    active: 'border-slate-600 bg-slate-600',
    inactive: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    activeText: 'text-white',
    activeLabel: 'text-white',
    inactiveText: 'text-slate-600',
    inactiveLabel: 'text-slate-600',
  },
}

export function StatCard({ label, value, toneName, isActive, onClick }) {
  const tone = TONE_STYLES[toneName] ?? TONE_STYLES.slate
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`min-w-30 flex-1 rounded-xl border px-3 py-3.5 text-center shadow-sm transition-colors ${
        isActive ? tone.active : tone.inactive
      }`}
    >
      <p className={`text-sm font-semibold leading-tight ${isActive ? tone.activeLabel : tone.inactiveLabel}`}>
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${isActive ? tone.activeText : tone.inactiveText}`}>{value}</p>
    </button>
  )
}
