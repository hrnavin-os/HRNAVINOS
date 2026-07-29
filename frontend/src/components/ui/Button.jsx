const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  success: 'bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-600',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
  // Approve/Reject actions across the payments & approvals flow — soft-tone
  // buttons using the exact colors specified for those two actions.
  approve: 'bg-[#DCFCE7] text-[#059669] hover:bg-[#bbf7d0] focus-visible:outline-[#059669]',
  reject: 'bg-[#FEF2F2] text-[#DC2626] hover:bg-[#fee2e2] focus-visible:outline-[#DC2626]',
}

export function Button({ variant = 'primary', className = '', disabled, children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium
        transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
