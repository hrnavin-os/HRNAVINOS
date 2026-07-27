const TONES = {
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  pink: 'bg-pink-50 text-pink-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
  violet: 'bg-violet-50 text-violet-600',
  red: 'bg-red-50 text-red-600',
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', featured = false }) {
  return (
    <div
      className={`flex items-start gap-4 rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        featured ? 'border-blue-200' : 'border-slate-200'
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
        {Icon && <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      </div>
    </div>
  )
}
