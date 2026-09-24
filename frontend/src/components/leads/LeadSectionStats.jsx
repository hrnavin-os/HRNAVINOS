import {
  CalendarCheck,
  Layers,
  PhoneCall,
  PhoneMissed,
  Sparkles,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
// Shared so the stat cards and the Form Collection cards can't drift onto
// different colours for the same section - see the ordering note there.
import { SECTION_TONE_ORDER } from '@/constants/sectionTones'

// StatCard has always taken an icon; these rows just never passed one, so every
// card was a label and a number adrift in a large empty box. The icon also
// means the cards aren't separated by colour alone.
const STAGE_ICONS = {
  new_lead: Sparkles,
  rnr: PhoneMissed,
  pre_screening: PhoneCall,
  financial_approval: Wallet,
  batch_confirmation: CalendarCheck,
  lost: XCircle,
}

// Top-of-board stat cards: "All Leads" + one per Form Collection section
// (open-ended - reads live from config, same as the Section column filter).
// Each card doubles as a quick filter into that section.
// allLabel: what the unfiltered card is called - "All Leads" on the Foundation
// board, "All Entries" on the Induction one, which counts records rather than
// leads.
// lostCount/onSelectLost: optional trailing "Lost Students" card (Foundation
// board only) - every lost lead across all sections, as its own tab. While it's
// active no section card is.
export function LeadSectionStats({
  total, sections, bySection, activeSection, onSelect, allLabel = 'All Leads',
  lostCount, isLostActive = false, onSelectLost,
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard
        label={allLabel}
        value={total}
        toneName="brand"
        icon={Users}
        isActive={!isLostActive && activeSection === ''}
        onClick={() => onSelect('')}
      />
      {sections.map((section, index) => (
        <StatCard
          key={section.code}
          label={section.label}
          value={bySection[section.code] ?? 0}
          toneName={SECTION_TONE_ORDER[index % SECTION_TONE_ORDER.length]}
          icon={Layers}
          isActive={!isLostActive && activeSection === section.code}
          onClick={() => onSelect(section.code)}
        />
      ))}
      {onSelectLost && (
        <StatCard
          label="Lost Students"
          value={lostCount ?? 0}
          toneName="red"
          icon={XCircle}
          isActive={isLostActive}
          onClick={onSelectLost}
        />
      )}
    </div>
  )
}

// Drilled into one section: "All Leads" (of that section) + a card per
// pipeline stage, mirroring the pre-existing stage-tabs row this replaces
// at the top level - just scoped to the current section.
export function LeadSectionStageStats({ total, stages, byStatus, activeStage, onSelect }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <StatCard
        label="All Leads"
        value={total}
        toneName="brand"
        icon={Users}
        isActive={activeStage === ''}
        onClick={() => onSelect('')}
      />
      {stages.map((stage) => (
        <StatCard
          key={stage.value}
          label={stage.label}
          value={byStatus[stage.value] ?? 0}
          toneName={stage.tone}
          icon={STAGE_ICONS[stage.value]}
          isActive={activeStage === stage.value}
          onClick={() => onSelect(stage.value)}
        />
      ))}
    </div>
  )
}
