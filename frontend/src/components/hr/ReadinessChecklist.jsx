import { Check, X } from 'lucide-react'

// The gate list behind "can this batch be confirmed?". Mirrors the checks
// built server-side in BatchConfirmationService._build_readiness - the API is
// the authority, this only renders what it returns.
export function ReadinessChecklist({ checks }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((check) => (
        <li key={check.code} className="flex items-start gap-2">
          <span
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
              check.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}
          >
            {check.passed ? (
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            ) : (
              <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            )}
          </span>
          <span className="text-sm">
            <span className={check.passed ? 'text-slate-700' : 'font-medium text-slate-900'}>{check.label}</span>
            <span className="text-slate-400"> — {check.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
