import { forwardRef } from 'react'
import { FIELD, FIELD_LABEL } from '@/components/ui/Input'

// Same shell as Input, down to the height, so a Select and an Input sitting
// in one grid row are the same control wearing different contents.
export const Select = forwardRef(function Select({ label, error, required, className = '', children, ...props }, ref) {
  return (
    <label className="block">
      {label && (
        <span className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      <select
        ref={ref}
        className={`${FIELD} h-9 ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})
