import { WHATSAPP_STATUS } from '@/constants/whatsappStatus'

// Its own file because both the table row and the detail popup show it, and a
// second copy would be the thing that drifts when a status is renamed.
export function WhatsAppStatusPill({ status, size = 'sm' }) {
  const style = WHATSAPP_STATUS[status] ?? WHATSAPP_STATUS.not_invited
  const Icon = style.icon
  const large = size === 'lg'

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${style.pill} ${
        large ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      <Icon className={large ? 'h-4 w-4 shrink-0' : 'h-3.5 w-3.5 shrink-0'} strokeWidth={2.5} aria-hidden="true" />
      {style.label}
    </span>
  )
}
