import { useState } from 'react'
import { CATEGORY_COLORS } from '@/constants/analyticsPalette'

// The first two slots of the app's validated categorical palette, in its fixed
// order - the same blue and orange the Statistics canvas opens with.
const SERIES = [
  { key: 'foundation', label: 'Foundation leads', color: CATEGORY_COLORS[0] },
  { key: 'induction', label: 'Induction candidates', color: CATEGORY_COLORS[1] },
]

const W = 640
const H = 220
const PAD = { left: 30, right: 10, top: 12, bottom: 26 }

// Rounds the top of the scale up to something a gridline can be labelled
// with - 4, 10, 25, 50 - rather than whatever the busiest day happened to be.
function niceMax(value) {
  if (value <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(value))
  const nice = [1, 2, 2.5, 5, 10].find((factor) => factor * step >= value)
  return nice * step
}

const shortDay = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/**
 * Thirty days of arrivals: Induction candidates and Foundation leads, one line
 * each on a shared scale - the same unit (people a day), so one axis is honest.
 *
 * Hovering anywhere over a day shows both figures for it; the crosshair is the
 * whole column, not the 2px line, so the target is easy to hit.
 */
export function ActivityTrendChart({ days }) {
  const [active, setActive] = useState(null)
  const n = days.length
  const max = niceMax(Math.max(1, ...days.flatMap((day) => SERIES.map((series) => day[series.key]))))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (index) => PAD.left + (n > 1 ? (index * plotW) / (n - 1) : plotW / 2)
  const y = (value) => PAD.top + plotH * (1 - value / max)
  const step = n > 1 ? plotW / (n - 1) : plotW

  const line = (key) => days.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(day[key])}`).join(' ')
  const area = `${line('foundation')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const totals = Object.fromEntries(SERIES.map((series) => [series.key, days.reduce((sum, day) => sum + day[series.key], 0)]))
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(n / 5)

  const hovered = active === null ? null : days[active]
  // Kept on screen at the ends: centred over the first or last day it would
  // hang off the card.
  const tipAlign = active === null ? '' : active < 4 ? 'translate-x-0' : active > n - 5 ? '-translate-x-full' : '-translate-x-1/2'

  return (
    <div>
      {/* Two series, so a legend - and each carries its 30-day total, which is
          the number somebody glancing at this card actually wants. */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} aria-hidden="true" />
            {series.label}
            <span className="font-semibold text-slate-900 tabular-nums">{totals[series.key]}</span>
          </span>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily arrivals over the last 30 days">
          <defs>
            <linearGradient id="foundation-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0].color} stopOpacity="0.14" />
              <stop offset="100%" stopColor={SERIES[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive grid: three hairlines and their values, nothing more. */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray={tick ? '3 3' : undefined} />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}
          {days.map((day, index) =>
            index % labelEvery === 0 || index === n - 1 ? (
              <text key={day.day} x={x(index)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {shortDay(day.day)}
              </text>
            ) : null,
          )}

          <path d={area} fill="url(#foundation-fill)" />
          {SERIES.map((series) => (
            <path
              key={series.key}
              d={line(series.key)}
              fill="none"
              stroke={series.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hovered && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="#94a3b8" strokeDasharray="3 3" />
              {SERIES.map((series) => (
                <circle key={series.key} cx={x(active)} cy={y(hovered[series.key])} r="4.5" fill={series.color} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}

          {/* One hit column per day, the full plot height. */}
          {days.map((day, index) => (
            <rect
              key={day.day}
              x={x(index) - step / 2}
              y={PAD.top}
              width={step}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>

        {hovered && (
          <div
            className={`pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg ${tipAlign}`}
            style={{ left: `${(x(active) / W) * 100}%` }}
          >
            <p className="mb-1 font-semibold text-slate-900">
              {new Date(`${hovered.day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
            {SERIES.map((series) => (
              <p key={series.key} className="flex items-center gap-2 whitespace-nowrap text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} aria-hidden="true" />
                {series.label}
                <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">{hovered[series.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
