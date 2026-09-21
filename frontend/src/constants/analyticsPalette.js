// The dashboard's colour, in one place and validated rather than picked.
//
// Every value here was run through the categorical validator (lightness band,
// chroma floor, adjacent-pair separation under deuteranopia and normal vision,
// contrast against the white card) before being used. Re-run it before
// changing one: a hue picked by eye to "go with" the others is exactly the one
// that turns out to be indistinguishable from a neighbour under colour
// blindness.

// Fixed slot order, assigned by position and never cycled. Last validated at
// worst adjacent CVD deltaE 11.3 (target >= 8), worst normal-vision 26.4, every
// slot at least 3:1 against the card. The order IS the colour-blind-safety
// mechanism, not decoration - re-run the validator before reordering.
export const CATEGORY_COLORS = ['#2563eb', '#ea580c', '#0d9488', '#7c3aed', '#db2777', '#65a30d']

// The tail, once there are more values than there are slots. A seventh
// generated hue is indistinguishable from an existing one under colour
// blindness, so the palette is never extended - the tail goes grey and its
// identity is carried by its label instead. Which is why every view now prints
// the label: grey is only honest when the name is beside it.
export const OTHER_COLOR = '#94a3b8'

// Anything with no value recorded. Deliberately outside the palette - it is
// the absence of a value, and a palette hue would present it as one more of
// the things being compared.
export const MUTED = '#94a3b8'
export const EMPTY_COLOR = '#cbd5e1'

// The single hue a chart wears when it is drawn on its own, with no sibling
// view to keep colours in step with.
export const BAR = '#2563eb'

/**
 * One colour per entity, for every view on a canvas to share.
 *
 * Four charts of one breakdown sit side by side on the Statistics board, and
 * "Career Gap" has to be the same teal in all four of them - a category that
 * changes colour between two charts a hand's width apart is the single fastest
 * way to make a dashboard untrustworthy. So the assignment is made once, from
 * the entity's rank in the whole breakdown, and every view reads it.
 *
 * Past six values the sixth slot is spent on the tail rather than on the sixth
 * entity, so everything below the top five wears one grey in every view at
 * once. Nothing is merged by it - the tail values still get their own arc,
 * bar, column and tile, and their own row in the list beside it; they simply
 * stop being told apart by hue, which past six slots they could not be.
 *
 * `item.color` wins where the data brings its own - the call-remark groups are
 * coloured by the constants every other surface names them from.
 */
export function colorByEntity(items, valueKey = 'count') {
  const ranked = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const filled = ranked.filter((item) => item[valueKey] > 0)
  const hues = filled.length > CATEGORY_COLORS.length ? CATEGORY_COLORS.length - 1 : CATEGORY_COLORS.length

  const colors = new Map()
  let slot = 0
  for (const item of ranked) {
    if (item.color) colors.set(item.value, item.color)
    else if (item[valueKey] <= 0) colors.set(item.value, EMPTY_COLOR)
    else colors.set(item.value, slot < hues ? CATEGORY_COLORS[slot] : OTHER_COLOR)
    if (item[valueKey] > 0) slot += 1
  }
  return colors
}

/**
 * The breakdown ranked biggest-first, each row carrying its own colour.
 *
 * What the ring and the ranked bars are drawn from, and the one ordering all
 * four views agree on. Nothing is folded away: every value keeps its own row,
 * its own arc and its own bar, and the ones past the palette's six validated
 * slots wear the tail's grey - identity there is carried by the label, which
 * is now always printed beside the mark rather than swallowed by an
 * "Other (14)" that named none of them.
 *
 * Empty values sort to the end, where the legend prints them and no chart
 * draws them.
 */
export function rankedWithColor(items, valueKey = 'count') {
  const colors = colorByEntity(items, valueKey)
  return [...items]
    .sort((a, b) => b[valueKey] - a[valueKey])
    .map((item) => ({ ...item, color: colors.get(item.value) }))
}

// Which ink a label printed on top of a filled mark should wear. Computed from
// the fill's own luminance rather than assumed: the palette runs from a very
// dark blue to a mid lime, and a white label that reads cleanly on one of them
// is close to invisible on another.
export function inkOn(fill) {
  const channel = (offset) => {
    const value = parseInt(fill.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.3 ? '#1e293b' : '#ffffff'
}

export function percent(part, whole) {
  if (!whole) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * The same hue, one step deeper, for a mark that carries its label on top of
 * itself - a treemap tile, where the fill is the only place the name can go.
 *
 * Measured rather than eyeballed: at full saturation a white label on the lime
 * slot is 3.1:1 and on the orange 3.6:1, both under AA for 11px text, and the
 * dark-ink alternative is no better (4.9 and 4.2). Deepened by a fifth, white
 * clears AA on every slot - worst is lime at 4.62:1 - and the hue is still
 * plainly the same hue, which is what a reader matches across the four charts.
 *
 * The grey tail is too light to take a white label at any sane darkening, so it
 * steps to slate-500 (4.76:1) instead of being deepened.
 */
export function labelledFill(color) {
  if (color === OTHER_COLOR || color === EMPTY_COLOR) return '#64748b'
  const channel = (offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.8)
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`
}
