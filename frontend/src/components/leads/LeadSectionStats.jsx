// Top-of-board stat cards: "All Leads" + one per Form Collection section
// (open-ended - reads live from config, same as the Section filter dropdown).
// Each card doubles as a quick filter, mirroring the section cards' behavior.
function StatCard({ label, value, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border p-4 text-center shadow-sm transition-colors ${
        isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </button>
  )
}

export function LeadSectionStats({ total, sections, bySection, activeSection, onSelect }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard label="All Leads" value={total} isActive={activeSection === ''} onClick={() => onSelect('')} />
      {sections.map((section) => (
        <StatCard
          key={section.code}
          label={section.label}
          value={bySection[section.code] ?? 0}
          isActive={activeSection === section.code}
          onClick={() => onSelect(section.code)}
        />
      ))}
    </div>
  )
}
