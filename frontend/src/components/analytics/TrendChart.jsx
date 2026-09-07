import { useState } from 'react'
import { BAR } from '@/constants/analyticsPalette'

/**
 * The breakdown as a line over time.
 *
 * Offered only where the values sit on an axis - the batch dimension, where
 * each value is a month and the months run in order. A line drawn across
 * categories asserts that the space between two of them means something, and
 * between "Data Science" and "Full Stack" it means nothing at all: that is a
 * chart telling a lie, so this view isn't offered there.
 *
 * What it adds over the columns beside it is the shape between the points -
 * whether an intake is climbing, flat or falling is a fact about the run of
 * months, and it is the one thing a set of separate columns is worst at.
 *
 * The area under the line is a wash rather than a fill: the quantity is the
 * height of the line, and a solid block underneath reads as a second, larger
 * quantity of its own.
 */
const WIDTH = 720
const HEIGHT = 220
// Room for the value axis on the left and the month labels underneath.
const PAD = { top: 16, right: 16, bottom: 34, left: 36 }

export function TrendChart({
  items,
  valueKey = 'count',
  emptyMessage = 'Nothing to show yet.',
  measure = 'count',
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null)

  const rows = items
  const total = rows.reduce((sum, row) => sum + row[valueKey], 0)

  if (!total || rows.length < 2) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
        {rows.length < 2 && total ? 'A trend needs at least two periods to run between.' : emptyMessage}
      </p>
    )
  }

  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  // The axis tops out above the tallest point rather than at it, so the peak
  // isn't drawn flush against the top edge where it reads as clipped.
  const ceiling = Math.max(...rows.map((row) => row[valueKey]), 1)
  const headroom = Math.ceil(ceiling * 1.15)
  const share = (value) => Math.round((value / total) * 1000) / 10

  const x = (index) => PAD.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth)
  const y = (value) => PAD.top + plotHeight - (value / headroom) * plotHeight

  const points = rows.map((row, index) => ({ ...row, x: x(index), y: y(row[valueKey]) }))
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${PAD.left},${PAD.top + plotHeight} ${line} ${points.at(-1).x},${PAD.top + plotHeight}`

  // Four gridlines, labelled. A line chart with no scale beside it is a shape,
  // not a measurement - and the shape alone is what makes people read a rise
  // from 2 to 3 as a doubling of an intake.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(headroom * fraction))

  const activeIndex = hovered ?? points.findIndex((point) => point.value === selected)
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full min-w-160"
        role="img"
        aria-label={`Trend across ${rows.length} periods`}
        onMouseLeave={() => setHovered(null)}
      >
        {[...new Set(ticks)].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text x={PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
              {tick}
            </text>
          </g>
        ))}

        <polygon points={area} fill={BAR} opacity="0.08" />
        <polyline
          points={line}
          fill="none"
          stroke={BAR}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) => {
          const isActive = activeIndex === index
          return (
            <g key={point.value}>
              {/* A generous transparent target over each point - a 4px dot is
                  a pinpoint nobody hits. */}
              <circle
                cx={point.x}
                cy={point.y}
                r="14"
                fill="transparent"
                className="cursor-pointer outline-none"
                tabIndex={0}
                role="button"
                aria-pressed={point.value === selected}
                aria-label={`${point.value}${point.period ? ` (${point.period})` : ''}: ${point[valueKey]}`}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelect?.(point.value === selected ? null : point.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect?.(point.value === selected ? null : point.value)
                  }
                }}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={isActive ? 5.5 : 3.5}
                fill="#ffffff"
                stroke={BAR}
                strokeWidth="2.5"
                className="pointer-events-none transition-all"
              />
              {/* The batch number on the axis, the month under it: the number
                  is what people say, the month is what says which one. */}
              <text
                x={point.x}
                y={HEIGHT - PAD.bottom + 16}
                textAnchor="middle"
                className={`text-[9px] ${isActive ? 'fill-slate-700 font-semibold' : 'fill-slate-500'}`}
              >
                {point.value}
              </text>
              {point.period && (
                <text
                  x={point.x}
                  y={HEIGHT - PAD.bottom + 26}
                  textAnchor="middle"
                  className="fill-slate-400 text-[8px]"
                >
                  {point.period}
                </text>
              )}
            </g>
          )
        })}

        {activePoint && (
          // The readout rides above the point it belongs to, clamped inside
          // the plot so a peak at either end doesn't push it off the canvas.
          <g className="pointer-events-none">
            <rect
              x={Math.min(Math.max(activePoint.x - 34, 2), WIDTH - 70)}
              y={Math.max(activePoint.y - 30, 2)}
              width="68"
              height="22"
              rx="4"
              fill="#0f172a"
              opacity="0.92"
            />
            <text
              x={Math.min(Math.max(activePoint.x, 36), WIDTH - 36)}
              y={Math.max(activePoint.y - 15, 17)}
              textAnchor="middle"
              className="fill-white text-[10px] font-semibold"
            >
              {measure === 'share'
                ? `${share(activePoint[valueKey])}%`
                : `${activePoint[valueKey]} · ${share(activePoint[valueKey])}%`}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
