import { forwardRef } from 'react'
import { FIELD, FIELD_LABEL } from '@/components/ui/Input'

// No fixed height, for obvious reasons - otherwise the same field shell as
// Input and Select, so a form mixing all three reads as one set of controls.
export const Textarea = forwardRef(function Textarea({ label, error, required, className = '', rows = 3, ...props }, ref) {
  return (
    <label className="block">
      {label && (
        <span className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`${FIELD} py-2 ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
})
