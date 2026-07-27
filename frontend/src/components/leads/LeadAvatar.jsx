const PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]

function toneFor(name) {
  const code = (name ?? '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return PALETTE[code % PALETTE.length]
}

export function LeadAvatar({ name, size = 'h-8 w-8' }) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?'
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneFor(name)}`}
    >
      {initial}
    </span>
  )
}
