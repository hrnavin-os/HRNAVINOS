import { forwardRef } from 'react'

// The one field shell. Label, control and error message are all sized here so
// every form in the app states a field the same way: a 12px label above a
// 36px control, with the error taking the place of nothing - it is added
// under the field, so a form does not reflow when one appears.
//
// FIELD is shared with Select and Textarea. Any change to how a field looks -
// its height, its border, what focus does - belongs in these three lines and
// nowhere else.
export const FIELD = `w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900
  shadow-sm transition-colors placeholder:text-slate-400
  focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
  disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`

export const FIELD_LABEL = 'mb-1 block text-xs font-medium text-slate-600'

export const Input = forwardRef(function Input({ label, error, required, rightElement, className = '', ...props }, ref) {
  return (
    <label className="block">
      {label && (
        <span className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      <span className="relative block">
        <input
          ref={ref}
          className={`${FIELD} h-9 ${error ? 'border-red-400' : ''} ${rightElement ? 'pr-10' : ''} ${className}`}
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
