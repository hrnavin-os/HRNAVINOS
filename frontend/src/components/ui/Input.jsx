import { forwardRef } from 'react'

export const Input = forwardRef(function Input({ label, error, className = '', ...props }, ref) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-slate-700">{label}</span>}
      <input
        ref={ref}
        className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 shadow-sm
          focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
          ${error ? 'border-red-400' : 'border-slate-300'} ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})
