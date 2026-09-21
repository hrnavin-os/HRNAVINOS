import { useState } from 'react'
import { colorByEntity, labelledFill } from '@/constants/analyticsPalette'

/**
 * The breakdown as nested rectangles, each one's area its share of the whole.
 *
 * The part-to-whole view for when there are too many values for a ring. A
 * donut of fourteen batches is fourteen slivers nobody can compare; the same
 * fourteen as tiles are all readable at once, and the biggest two or three are
 * obvious without reading a single number. Nothing folds into "Other" here,
 * which is the point of having it.
 *
 * Area is a weaker encoding than length - people under-read large rectangles
 * and over-read small ones - so this is the overview, and the bars beside it
 * are where a close comparison actually gets made. Both are offered because
 * they are different readings, not because one is a prettier version of the
 * other.
 *
 * Coloured per entity, from the assignment every view on the canvas shares,
 * so a category is the same colour here as it is in the ring beside it. It used
 * to shade down one hue by rank, which read well alone and badly in company:
 * rank is not identity, a filter that reordered the values repainted all of
 * them, and one category came out blue here and teal in the ring.
 *
 * The palette is not extended past its six validated slots - the tail wears one
 * grey, and identity there is carried by the label on the tile.
 *
 * Tiles take the deepened step of their hue, because this is the one view whose
 * labels have nowhere to sit but on top of the mark and white text needs the
 * contrast. See labelledFill for the measurements.
 *
 * Laid out by the squarified algorithm (Bruls, Huizing & van Wijk 2000), which
 * keeps tiles close to square. Laid out naively they come out as long thin
 * slivers, which is as unreadable as the ring this is meant to replace.
 */

// What a label needs, in the pixels the tiles are actually drawn at.
//
// The map is laid out in percentages of a box whose height is fixed and whose
// width is whatever the panel gives it - so a percentage of the height is a
// known number of pixels and a percentage of the width is not. Judging both by
// one percentage was what left tiles blank: 13% of a 700px-wide canvas cell is
// 91px, room for a name twice over, and a tile at 12% got nothing at all while
// a far shorter one beside it got both lines.
//
// So height decides how much is printed, measured against the line it has to
// fit, and width only has to clear a sliver - the name truncates, and a
// truncated name identifies a tile where a blank one identifies nothing.
const BOX_HEIGHT = 288 // h-72
const LINE = 16 // one line of the 11px label
const PAD_FULL = 16 // p-2, top and bottom
const PAD_TIGHT = 8 // p-1, top and bottom
// Below this there is no room for even an ellipsis, and half a letter reads as
// a rendering fault rather than as a label.
const MIN_WIDTH = 4 // percent

// The worst aspect ratio in a row of tiles laid along `side`. The layout adds
// tiles to a row while this keeps improving and closes the row when it stops.
function worstRatio(row, side) {
  const sum = row.reduce((total, item) => total + item.area, 0)
  const max = Math.max(...row.map((item) => item.area))
  const min = Math.min(...row.map((item) => item.area))
  if (!sum || !min || !side) return Infinity
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

function squarify(items, box) {
  const weight = items.reduce((total, item) => total + item.weight, 0)
  const boxArea = box.width * box.height
  // Scaled to real area once, up front. Each row then consumes exactly its own
  // area from the rectangle, so what is left always matches what is unplaced
  // and no step has to rescale.
  const queue = items.map((item) => ({ ...item, area: (item.weight / weight) * boxArea }))
  const tiles = []
  let area = { ...box }
  let row = []

  const flush = () => {
    if (!row.length) return
    const rowArea = row.reduce((total, item) => total + item.area, 0)
    // The strip is laid along the shorter side, which is what keeps the tiles
    // square-ish; on a wide rectangle that is a column down the left edge.
    const vertical = area.width >= area.height
    const thickness = rowArea / (vertical ? area.height : area.width)
    let offset = 0
    for (const item of row) {
      const length = item.area / thickness
      tiles.push(
        vertical
          ? { ...item, x: area.x, y: area.y + offset, width: thickness, height: length }
          : { ...item, x: area.x + offset, y: area.y, width: length, height: thickness },
      )
      offset += length
    }
    area = vertical
      ? { x: area.x + thickness, y: area.y, width: area.width - thickness, height: area.height }
      : { x: area.x, y: area.y + thickness, width: area.width, height: area.height - thickness }
    row = []
  }

  while (queue.length) {
    const side = Math.min(area.width, area.height)
    if (!row.length || worstRatio([...row, queue[0]], side) <= worstRatio(row, side)) {
      row.push(queue.shift())
    } else {
      flush()
    }
  }
  flush()
  return tiles
}

export function TreemapChart({
  items,
  valueKey = 'count',
  emptyMessage = 'Nothing to show yet.',
  measure = 'count',
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)

  // Zero-value entries have no area, so they cannot be tiles. Named underneath
  // rather than dropped: a course nobody is on is a finding, and this view
  // still has to be able to say it.
  const sorted = [...items].sort((a, b) => b[valueKey] - a[valueKey])
  const filled = sorted.filter((item) => item[valueKey] > 0)
  const empty = sorted.filter((item) => item[valueKey] <= 0)
  const total = filled.reduce((sum, item) => sum + item[valueKey], 0)

  if (!total) {
    return <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
  }

  // Laid out in a 100x100 square and rendered as percentages, so the map fills
  // whatever width the panel gives it without anything measuring the DOM.
  //
  // How much of a label each tile can hold is decided once here rather than
  // inside the render, so the note
  // under the map can name exactly the tiles that came out blank. A tile
  // nobody can identify is the one thing this view must not leave on screen,
  // and at some mix of values there is always one too small to letter.
  const tiles = squarify(
    filled.map((item) => ({ ...item, weight: item[valueKey] })),
    { x: 0, y: 0, width: 100, height: 100 },
  ).map((tile) => {
    const height = (tile.height / 100) * BOX_HEIGHT
    const wide = tile.width > MIN_WIDTH
    const full = wide && height >= 2 * LINE + PAD_FULL
    return { ...tile, pxHeight: height, full, named: wide && !full && height >= LINE + PAD_TIGHT }
  })
  const unlabelled = tiles.filter((tile) => !tile.full && !tile.named)
  const share = (value) => Math.round((value / total) * 1000) / 10
  const colors = colorByEntity(items, valueKey)

  return (
    <div className="w-full">
      <div className="relative h-72 w-full overflow-hidden rounded-lg bg-slate-50">
        {tiles.map((tile) => {
          const isSelected = tile.value === selected
          const isHovered = hovered === tile.value
          const dimmed = (selected || hovered) && !isSelected && !isHovered
          const fill = labelledFill(colors.get(tile.value))
          // Dropped a line at a time rather than all at once. A tile with room
          // for two lines carries its name and its figure; one with room for a
          // single line carries the name, because the name is the half that
          // cannot be guessed from the tile itself - its area already says
          // roughly what the figure is, and the exact number is on the hover
          // title and in the three views beside this one.
          const { full, named } = tile
          return (
            <button
              key={tile.value}
              type="button"
              aria-pressed={isSelected}
              title={`${tile.value}${tile.period ? ` · ${tile.period}` : ''}: ${tile[valueKey]} (${share(tile[valueKey])}%)`}
              onMouseEnter={() => setHovered(tile.value)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(tile.value)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect?.(isSelected ? null : tile.value)}
              className={`absolute overflow-hidden text-left transition-opacity ${
                full ? 'p-2' : 'p-1'
              } ${dimmed ? 'opacity-35' : ''} ${
                isSelected ? 'ring-2 ring-inset ring-slate-900' : ''
              }`}
              style={{
                left: `${tile.x}%`,
                top: `${tile.y}%`,
                width: `${tile.width}%`,
                height: `${tile.height}%`,
                backgroundColor: fill,
                // A hairline of the page's own surface between tiles rather
                // than a border on each: a border reads as part of the mark.
                outline: '2px solid #f8fafc',
              }}
            >
              {(full || named) && (
                <span className="block truncate text-[11px] font-semibold leading-4 text-white">
                  {tile.value}
                </span>
              )}
              {full && (
                <>
                  <span className="block text-[11px] font-bold leading-4 tabular-nums text-white">
                    {measure === 'share' ? `${share(tile[valueKey])}%` : tile[valueKey]}
                  </span>
                  {tile.period && tile.pxHeight >= 3 * LINE + PAD_FULL && (
                    <span className="block truncate text-[10px] leading-4 text-white/80">
                      {tile.period}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* The tiles too small to letter, named here instead. Two different
          statements, so two different notes: one is a value with nobody in it
          and no tile at all, the other is a tile that is drawn and simply has
          nowhere to put its name. */}
      {unlabelled.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Too small to label:{' '}
          {unlabelled
            .map((tile) => `${tile.value} (${measure === 'share' ? `${share(tile[valueKey])}%` : tile[valueKey]})`)
            .join(' · ')}
        </p>
      )}

      {empty.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Nothing to draw for {empty.map((item) => item.value).join(', ')} - nobody has been filed under
          {empty.length > 1 ? ' them' : ' it'} yet.
        </p>
      )}
    </div>
  )
}
