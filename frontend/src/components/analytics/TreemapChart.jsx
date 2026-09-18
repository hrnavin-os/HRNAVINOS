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
  const tiles = squarify(
    filled.map((item) => ({ ...item, weight: item[valueKey] })),
    { x: 0, y: 0, width: 100, height: 100 },
  )
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
          // Below roughly this size the label doesn't fit, and printing it
          // anyway leaves a tile of broken text - the hover title and the
          // table underneath carry those.
          const roomy = tile.width > 13 && tile.height > 13
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
              className={`absolute overflow-hidden p-2 text-left transition-opacity ${
                dimmed ? 'opacity-35' : ''
              } ${isSelected ? 'ring-2 ring-inset ring-slate-900' : ''}`}
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
              {roomy && (
                <>
                  <span className="block truncate text-[11px] font-semibold text-white">
                    {tile.value}
                  </span>
                  <span className="block text-[11px] font-bold tabular-nums text-white">
                    {measure === 'share' ? `${share(tile[valueKey])}%` : tile[valueKey]}
                  </span>
                  {tile.period && tile.height > 22 && (
                    <span className="block truncate text-[10px] text-white/80">{tile.period}</span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      {empty.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Nothing to draw for {empty.map((item) => item.value).join(', ')} - nobody has been filed under
          {empty.length > 1 ? ' them' : ' it'} yet.
        </p>
      )}
    </div>
  )
}
