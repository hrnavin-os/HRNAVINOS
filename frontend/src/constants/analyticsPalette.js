// The dashboard's colour, in one place and validated rather than picked.
//
// Every value here was run through the categorical validator (lightness band,
// chroma floor, adjacent-pair separation under deuteranopia and normal vision,
// contrast against the white card) before being used. Re-run it before
// changing one: a hue picked by eye to "go with" the others is exactly the one
// that turns out to be indistinguishable from a neighbour under colour
// blindness.

// The single hue every ranked bar wears. One measure across many labels is the
// case for one colour: giving each bar its own would encode rank as identity,
// and repaint every bar the moment a filter changed the order. The bar's
// length carries the number; colour carries nothing, which is right.
export const BAR = '#2563eb'

// Anything with no value recorded. Deliberately outside the palette - it is
// the absence of a value, and a palette hue would present it as one more of
// the things being compared.
export const MUTED = '#94a3b8'

export function percent(part, whole) {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}
