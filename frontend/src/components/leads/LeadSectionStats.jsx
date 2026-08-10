import { StatCard } from '@/components/ui/StatCard'
// Shared so the stat cards and the Form Collection cards can't drift onto
// different colours for the same section - see the ordering note there.
import { SECTION_TONE_ORDER } from '@/constants/sectionTones'

// Top-of-board stat cards: "All Leads" + one per Form Collection section
// (open-ended - reads live from config, same as the Section column filter).
// Each card doubles as a quick filter into that section.
// allLabel: what the unfiltered card is called - "All Leads" on the Foundation
// board, "All Entries" on the Induction one, which counts records rather than
// leads.
export function LeadSectionStats({ total, sections, bySection, activeSection, onSelect, allLabel = 'All Leads' }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard label={allLabel} value={total} toneName="brand" isActive={activeSection === ''} onClick={() => onSelect('')} />
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
