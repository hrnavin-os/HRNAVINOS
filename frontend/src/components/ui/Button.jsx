// Solid actions carry a hairline of their own colour rather than a shadow:
// on a white card a shadowed button reads as floating, and the ring is what
// keeps a filled control looking seated in the surface with a defined edge.
const VARIANTS = {
  primary: 'bg-brand-600 text-white ring-1 ring-inset ring-brand-700/20 hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 focus-visible:outline-slate-400',
  danger: 'bg-red-600 text-white ring-1 ring-inset ring-red-700/20 hover:bg-red-700 focus-visible:outline-red-600',
  success: 'bg-green-600 text-white ring-1 ring-inset ring-green-700/20 hover:bg-green-700 focus-visible:outline-green-600',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
  // Approve/Reject actions across the payments & approvals flow — soft-tone
  // buttons using the exact colors specified for those two actions.
  approve: 'bg-[#DCFCE7] text-[#059669] ring-1 ring-inset ring-[#a7f3d0] hover:bg-[#bbf7d0] focus-visible:outline-[#059669]',
  reject: 'bg-[#FEF2F2] text-[#DC2626] ring-1 ring-inset ring-[#fecaca] hover:bg-[#fee2e2] focus-visible:outline-[#DC2626]',
}

// h-9 (36px) is the app's control height - the same one Input, Select and
// every filter trigger uses, so a button placed beside any of them in a
// toolbar lines up on both edges instead of being a pixel or two taller.
// Set explicitly rather than falling out of padding, which drifts the moment
// a caller passes a different text size or an icon-only label.
export function Button({ variant = 'primary', className = '', disabled, children, ...props }) {
  return (
    <button
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5
        text-sm font-medium transition-colors focus-visible:outline-2
        focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
