import { LEAD_STAGES } from '@/constants/leadStages'

const TONES = {
  emerald: { active: 'bg-emerald-600 text-white', inactive: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  blue: { active: 'bg-blue-600 text-white', inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  red: { active: 'bg-red-600 text-white', inactive: 'bg-red-50 text-red-700 hover:bg-red-100' },
  amber: { active: 'bg-amber-500 text-white', inactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  violet: { active: 'bg-violet-600 text-white', inactive: 'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  slate: { active: 'bg-slate-600 text-white', inactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
}

function Segment({ label, value, tone, isActive, isLast, onClick }) {
  const toneClasses = TONES[tone] ?? TONES.slate
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-4 text-center transition-colors ${isLast ? '' : 'border-r border-slate-200'} ${
        isActive ? toneClasses.active : toneClasses.inactive
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </button>
  )
}

export function LeadStageStats({ total, byStatus = {}, activeStatus, onSelect }) {
  return (
    <div className="mb-4 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Segment label="All Stages" value={total} tone="emerald" isActive={activeStatus === ''} onClick={() => onSelect('')} />
      {LEAD_STAGES.map((stage, index) => (
        <Segment
          key={stage.value}
          label={stage.label}
          value={byStatus[stage.value] ?? 0}
          tone={stage.tone}
          isActive={activeStatus === stage.value}
          isLast={index === LEAD_STAGES.length - 1}
          onClick={() => onSelect(stage.value)}
        />
      ))}
    </div>
  )
}
