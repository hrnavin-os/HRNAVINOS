// Accent cycle for anything rendered one-per-section (stat cards, form cards),
// so a section reads as the same colour wherever it appears.
//
// The ORDER is deliberate, not alphabetical: these render side by side, so
// adjacent cards have to stay separable. The names are the old accents; each
// resolves to a nude ramp (styles/index.css) - fog, sage, mauve, caramel,
// blush, sand in this order. Nudes are low-chroma, so the order alternates
// their lightness: the worst adjacent pair is blush/sand at deltaE 8.8 under
// normal vision, and every card is labelled besides. Re-check before
// reshuffling.
export const SECTION_TONE_ORDER = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan']

export function sectionToneAt(index) {
  return SECTION_TONE_ORDER[index % SECTION_TONE_ORDER.length]
}

// Low-opacity card surfaces: enough tint to tell two cards apart at a glance,
// not enough to fight the text sitting on them.
// A full step of the nude rather than 60% of it, which is next to white.
export const CARD_TONE_CLASSES = {
  blue: 'border-fog-200 bg-fog-50',
  emerald: 'border-sage-200 bg-sage-50',
  violet: 'border-mauve-200 bg-mauve-50',
  amber: 'border-caramel-200 bg-caramel-50',
  rose: 'border-blush-200 bg-blush-50',
  cyan: 'border-sand-200 bg-sand-50',
}

// The icon plate keeps the accent at full strength - it's the one element
// small enough to carry a saturated colour without shouting.
//
// One step, not a gradient: at 40px a two-stop ramp is not read as depth, only
// as an edge that doesn't match the flat plates everywhere else in the app.
export const CARD_PLATE_CLASSES = {
  blue: 'bg-fog-600',
  emerald: 'bg-sage-600',
  violet: 'bg-mauve-600',
  amber: 'bg-caramel-600',
  rose: 'bg-blush-600',
  cyan: 'bg-sand-600',
}
