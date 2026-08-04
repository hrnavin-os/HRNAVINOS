// Shared stat-card look for the Admin board's top row - both the top-level
// "All Leads / A Section / B Section / C Section" row and the per-section
// drilled-down "All Leads / New Lead / RNR / ..." stage row use this same
// tone system. Selected cards get a solid dark background (not just a
// light tint) so the active filter reads clearly at a glance.
const TONE_STYLES = {
  brand: {
    active: 'border-brand-600 bg-brand-600',
    inactive: 'border-slate-200 bg-white hover:bg-slate-50',
    activeText: 'text-white',
    activeLabel: 'text-brand-100',
    inactiveText: 'text-slate-900',
    inactiveLabel: 'text-slate-500',
  },
  blue: {
    active: 'border-blue-600 bg-blue-600',
    inactive: 'border-blue-200 bg-blue-50/40 hover:bg-blue-50',
    activeText: 'text-white',
    activeLabel: 'text-blue-100',
    inactiveText: 'text-blue-700',
    inactiveLabel: 'text-slate-500',
  },
  emerald: {
    active: 'border-emerald-600 bg-emerald-600',
    inactive: 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50',
    activeText: 'text-white',
    activeLabel: 'text-emerald-100',
    inactiveText: 'text-emerald-700',
    inactiveLabel: 'text-slate-500',
  },
  amber: {
    active: 'border-amber-600 bg-amber-600',
    inactive: 'border-amber-200 bg-amber-50/40 hover:bg-amber-50',
    activeText: 'text-white',
    activeLabel: 'text-amber-100',
    inactiveText: 'text-amber-700',
    inactiveLabel: 'text-slate-500',
  },
  violet: {
    active: 'border-violet-600 bg-violet-600',
    inactive: 'border-violet-200 bg-violet-50/40 hover:bg-violet-50',
    activeText: 'text-white',
    activeLabel: 'text-violet-100',
    inactiveText: 'text-violet-700',
    inactiveLabel: 'text-slate-500',
  },
  rose: {
    active: 'border-rose-600 bg-rose-600',
    inactive: 'border-rose-200 bg-rose-50/40 hover:bg-rose-50',
    activeText: 'text-white',
    activeLabel: 'text-rose-100',
    inactiveText: 'text-rose-700',
    inactiveLabel: 'text-slate-500',
  },
  cyan: {
    active: 'border-cyan-600 bg-cyan-600',
    inactive: 'border-cyan-200 bg-cyan-50/40 hover:bg-cyan-50',
    activeText: 'text-white',
    activeLabel: 'text-cyan-100',
    inactiveText: 'text-cyan-700',
    inactiveLabel: 'text-slate-500',
  },
  red: {
    active: 'border-red-600 bg-red-600',
    inactive: 'border-red-200 bg-red-50/40 hover:bg-red-50',
    activeText: 'text-white',
    activeLabel: 'text-red-100',
    inactiveText: 'text-red-700',
    inactiveLabel: 'text-slate-500',
  },
  slate: {
    active: 'border-slate-700 bg-slate-700',
    inactive: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    activeText: 'text-white',
    activeLabel: 'text-slate-300',
    inactiveText: 'text-slate-700',
    inactiveLabel: 'text-slate-500',
  },
}

// Cycled across sections so any number of them (A/B/C, or a newly added D...)
// each get a distinct accent rather than all looking identical.
const SECTION_TONE_ORDER = ['blue', 'emerald', 'amber', 'violet', 'rose', 'cyan']

function StatCard({ label, value, toneName, isActive, onClick }) {
  const tone = TONE_STYLES[toneName] ?? TONE_STYLES.slate
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border p-4 text-center shadow-sm transition-colors ${isActive ? tone.active : tone.inactive}`}
    >
      <p className={`text-sm font-medium ${isActive ? tone.activeLabel : tone.inactiveLabel}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${isActive ? tone.activeText : tone.inactiveText}`}>{value}</p>
    </button>
  )
}

// Top-of-board stat cards: "All Leads" + one per Form Collection section
// (open-ended - reads live from config, same as the Section column filter).
// Each card doubles as a quick filter into that section.
export function LeadSectionStats({ total, sections, bySection, activeSection, onSelect }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard label="All Leads" value={total} toneName="brand" isActive={activeSection === ''} onClick={() => onSelect('')} />
      {sections.map((section, index) => (
        <StatCard
          key={section.code}
          label={section.label}
          value={bySection[section.code] ?? 0}
          toneName={SECTION_TONE_ORDER[index % SECTION_TONE_ORDER.length]}
          isActive={activeSection === section.code}
          onClick={() => onSelect(section.code)}
        />
      ))}
    </div>
  )
}

// Drilled into one section: "All Leads" (of that section) + a card per
// pipeline stage, mirroring the pre-existing stage-tabs row this replaces
// at the top level - just scoped to the current section.
export function LeadSectionStageStats({ total, stages, byStatus, activeStage, onSelect }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard label="All Leads" value={total} toneName="brand" isActive={activeStage === ''} onClick={() => onSelect('')} />
      {stages.map((stage) => (
        <StatCard
          key={stage.value}
          label={stage.label}
          value={byStatus[stage.value] ?? 0}
          toneName={stage.tone}
          isActive={activeStage === stage.value}
          onClick={() => onSelect(stage.value)}
        />
      ))}
    </div>
  )
}
