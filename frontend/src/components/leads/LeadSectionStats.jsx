// Top-of-board stat cards: "All Leads" + one per Form Collection section
// (open-ended - reads live from config, same as the Section filter dropdown).
// Each card doubles as a quick filter, mirroring the section cards' behavior.
const ALL_LEADS_TONE = {
  active: 'border-brand-500 bg-brand-50',
  inactive: 'border-slate-200 bg-white hover:bg-slate-50',
  value: 'text-brand-700',
}

// Cycled across sections so any number of them (A/B/C, or a newly added D...)
// each get a distinct accent rather than all looking identical.
const SECTION_TONE_PALETTE = [
  { active: 'border-blue-400 bg-blue-50', inactive: 'border-blue-200 bg-blue-50/40 hover:bg-blue-50', value: 'text-blue-700' },
  { active: 'border-emerald-400 bg-emerald-50', inactive: 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50', value: 'text-emerald-700' },
  { active: 'border-amber-400 bg-amber-50', inactive: 'border-amber-200 bg-amber-50/40 hover:bg-amber-50', value: 'text-amber-700' },
  { active: 'border-violet-400 bg-violet-50', inactive: 'border-violet-200 bg-violet-50/40 hover:bg-violet-50', value: 'text-violet-700' },
  { active: 'border-rose-400 bg-rose-50', inactive: 'border-rose-200 bg-rose-50/40 hover:bg-rose-50', value: 'text-rose-700' },
  { active: 'border-cyan-400 bg-cyan-50', inactive: 'border-cyan-200 bg-cyan-50/40 hover:bg-cyan-50', value: 'text-cyan-700' },
]

function StatCard({ label, value, tone, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border p-4 text-center shadow-sm transition-colors ${
        isActive ? tone.active : tone.inactive
      }`}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone.value}`}>{value}</p>
    </button>
  )
}

export function LeadSectionStats({ total, sections, bySection, activeSection, onSelect }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard label="All Leads" value={total} tone={ALL_LEADS_TONE} isActive={activeSection === ''} onClick={() => onSelect('')} />
      {sections.map((section, index) => (
        <StatCard
          key={section.code}
          label={section.label}
          value={bySection[section.code] ?? 0}
          tone={SECTION_TONE_PALETTE[index % SECTION_TONE_PALETTE.length]}
          isActive={activeSection === section.code}
          onClick={() => onSelect(section.code)}
        />
      ))}
    </div>
  )
}
