// The dashboard's colour, in one place and validated rather than picked.
//
// Every set here was run through the categorical validator (lightness band,
// chroma floor, adjacent-pair separation under deuteranopia and normal vision,
// contrast against the white card) before being used. Re-run it before
// reordering or extending any of them: the ORDER is the colour-blind-safety
// mechanism, not decoration, and a seventh hue appended by eye is
// indistinguishable from one already in the list.

// Series colours for the trend board: what came in, what crossed over, what
// walked. Validated as a 3-slot categorical palette - worst adjacent CVD
// deltaE 8.6 (deutan), normal-vision 27.2, all three at least 3:1 on white.
export const SERIES = {
  registered: '#2563eb',
  moved: '#059669',
  quit: '#dc2626',
}

// The single hue every ranked bar list and the funnel use. One measure across
// many labels is exactly the case for one colour: giving each bar its own
// would encode rank as identity, and repaint every bar the moment a filter
// changed the order. The bar's length carries the number; colour carries
// nothing, which is what it should carry.
export const BAR = '#2563eb'

// The waiting backlog. Amber as a warning state rather than a series hue - the
// bars say how long nobody has called these people, which is a problem, not a
// category. Contrast-checked against the white card at 3:1, so the bars are
// legible without relying on their labels.
export const WAIT = '#d97706'

// Anything with no value recorded. Deliberately outside the palettes - it is
// the absence of a value, and giving it a palette hue would present it as one
// more of the things being compared.
export const MUTED = '#94a3b8'

export function percent(part, whole) {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}
