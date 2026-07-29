import { forwardRef } from 'react'

export const Input = forwardRef(function Input({ label, error, required, rightElement, className = '', ...props }, ref) {
  return (
    <label className="block text-sm">
      {label && (
        <span className="mb-1 block font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      <span className="relative block">
        <input
          ref={ref}
          className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 shadow-sm
            focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
            ${error ? 'border-red-400' : 'border-slate-300'} ${rightElement ? 'pr-10' : ''} ${className}`}
          {...props}
        />
        {rightElement && (
          <span className="absolute inset-y-0 right-3 flex items-center">{rightElement}</span>
        )}
      </span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})
