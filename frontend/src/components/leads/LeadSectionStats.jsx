import { StatCard } from '@/components/ui/StatCard'

// Cycled across sections so any number of them (A/B/C, or a newly added D...)
// each get a distinct accent rather than all looking identical.
//
// The ORDER is deliberate, not alphabetical or by preference: neighbouring
// cards sit side by side, so adjacent hues have to stay separable for
// colour-blind readers. Emerald is kept away from both amber (weak under
// protanopia) and cyan (too close even with full colour vision). Verified with
// the palette validator: worst adjacent pair is rose/amber at deltaE 9.4
// (deutan) and 16.6 normal-vision, both above the floor. Re-run it before
// reshuffling these.
const SECTION_TONE_ORDER = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan']

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
