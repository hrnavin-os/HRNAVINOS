export function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200',
    brand: 'border-brand-200 bg-brand-50',
  }
  return (
    <div className={`rounded-lg border bg-white p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
