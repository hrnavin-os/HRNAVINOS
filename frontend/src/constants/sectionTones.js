// Accent cycle for anything rendered one-per-section (stat cards, form cards),
// so a section reads as the same colour wherever it appears.
//
// The ORDER is deliberate, not alphabetical: these render side by side, so
// adjacent hues have to stay separable for colour-blind readers. Emerald is
// kept away from both amber (weak under protanopia) and cyan (too close even
// with full colour vision). Verified with a palette validator - worst adjacent
// pair is rose/amber at deltaE 9.4 (deutan) and 16.6 normal-vision, both above
// the floor. Re-check before reshuffling.
export const SECTION_TONE_ORDER = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan']

export function sectionToneAt(index) {
  return SECTION_TONE_ORDER[index % SECTION_TONE_ORDER.length]
}

// Low-opacity card surfaces: enough tint to tell two cards apart at a glance,
// not enough to fight the text sitting on them.
export const CARD_TONE_CLASSES = {
  blue: 'border-blue-200 bg-blue-50/60',
  emerald: 'border-emerald-200 bg-emerald-50/60',
  violet: 'border-violet-200 bg-violet-50/60',
  amber: 'border-amber-200 bg-amber-50/60',
  rose: 'border-rose-200 bg-rose-50/60',
  cyan: 'border-cyan-200 bg-cyan-50/60',
}

// The icon plate keeps the accent at full strength - it's the one element
// small enough to carry a saturated colour without shouting.
export const CARD_PLATE_CLASSES = {
  blue: 'bg-linear-to-br from-blue-500 to-blue-700',
  emerald: 'bg-linear-to-br from-emerald-500 to-emerald-700',
  violet: 'bg-linear-to-br from-violet-500 to-violet-700',
  amber: 'bg-linear-to-br from-amber-500 to-amber-700',
  rose: 'bg-linear-to-br from-rose-500 to-rose-700',
  cyan: 'bg-linear-to-br from-cyan-500 to-cyan-700',
}
