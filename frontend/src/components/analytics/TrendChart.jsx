import { useEffect, useRef, useState } from 'react'
import { SERIES } from '@/constants/analyticsPalette'

const HEIGHT = 260
const PADDING = { top: 16, right: 16, bottom: 28, left: 36 }

const LINES = [
  { key: 'registered', label: 'Registered', color: SERIES.registered },
  { key: 'moved', label: 'Moved to Foundation', color: SERIES.moved },
  { key: 'quit', label: 'Quit', color: SERIES.quit },
]

// One label per period, in the words the bucket size makes sense in: a day is
// a date, a week is the week it starts, a month is a month.
function formatPeriod(iso, granularity) {
  const date = new Date(iso)
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(date)
  }
  const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date)
  return granularity === 'week' ? `w/c ${day}` : day
}

// A round number above the tallest point, so the gridlines land on values a
// reader can hold in their head rather than on 37 and 74.
function ceiling(value) {
  if (value <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = magnitude / 2
  return Math.ceil(value / step) * step
}

/**
 * Registrations over time, with what became of them.
 *
 * Three lines on one axis - all three are counts of candidates, so they share
 * a scale honestly. Never a second y-axis: two scales on one plot let any pair
 * of series be made to look correlated by choosing the ranges, which is the
 * single most misleading thing a chart can do.
 *
 * A crosshair and one tooltip carrying all three values, rather than a
 * per-point hover: the question a trend gets asked is "what happened in that
 * week", not "what is this dot".
 */
export function TrendChart({ points, granularity }) {
  const boxRef = useRef(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState(null)

  // Measured rather than a fixed viewBox scaled to fit: scaling the viewBox
  // scales the type with it, and the axis labels end up a different size on
  // every screen.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10)
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const top = ceiling(Math.max(...points.flatMap((point) => LINES.map((line) => point[line.key])), 0))

  const x = (index) =>
    PADDING.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const y = (value) => PADDING.top + plotHeight - (value / top) * plotHeight

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(top * fraction))
  // Never more than about six dates on the axis, whatever the window - past
  // that they overlap and the axis becomes a smear.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  function onMove(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - rect.left - PADDING.left
    const index = Math.round((offset / plotWidth) * (points.length - 1))
    setActive(Math.min(Math.max(index, 0), points.length - 1))
  }

  return (
    <div ref={boxRef} className="relative">
      {/* A legend is present for every multi-series chart, and the last point
          of each line is labelled directly, so identity never rests on colour
          alone. */}
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {LINES.map((line) => (
          <li key={line.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
            {line.label}
          </li>
        ))}
      </ul>

      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Registrations by ${granularity}, with how many moved to Foundation and how many quit`}
        onMouseMove={onMove}
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            {/* Recessive grid: it exists to be read off, not looked at. */}
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text x={PADDING.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {tick}
            </text>
          </g>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={point.period}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {formatPeriod(point.period, granularity)}
            </text>
          ) : null,
        )}

        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PADDING.top}
            y2={PADDING.top + plotHeight}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {LINES.map((line) => {
          const path = points
            .map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point[line.key])}`)
            .join(' ')
          const last = points.length - 1
          return (
            <g key={line.key}>
              <path d={path} fill="none" stroke={line.color} strokeWidth="2" strokeLinejoin="round" />
              {/* A single period has no line to draw, so it gets a dot - a
                  chart that renders nothing for one week of data looks
                  broken rather than sparse. */}
              {points.length === 1 && (
                <circle cx={x(0)} cy={y(points[0][line.key])} r="4" fill={line.color} />
              )}
              {active !== null && (
                // A 2px surface ring, so overlapping markers stay countable
                // where two series cross.
                <circle
                  cx={x(active)}
                  cy={y(points[active][line.key])}
                  r="4.5"
                  fill={line.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
              {points.length > 1 && (
                <text
                  x={x(last)}
                  y={y(points[last][line.key]) - 8}
                  textAnchor="end"
                  className="text-[10px] font-semibold"
                  fill={line.color}
                >
                  {points[last][line.key]}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute top-8 z-20 w-44 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
          // Flips to the left of the crosshair once it would run off the right
          // edge, so the last period's tooltip is still readable.
          style={
            x(active) > width - 190 ? { right: width - x(active) + 8 } : { left: x(active) + 8 }
          }
        >
          <p className="mb-1.5 font-semibold text-slate-900">
            {formatPeriod(points[active].period, granularity)}
          </p>
          <dl className="space-y-1">
            {LINES.map((line) => (
              <div key={line.key} className="flex items-baseline justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: line.color }}
                    aria-hidden="true"
                  />
                  {line.label}
                </dt>
                <dd className="font-semibold tabular-nums text-slate-800">{points[active][line.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
