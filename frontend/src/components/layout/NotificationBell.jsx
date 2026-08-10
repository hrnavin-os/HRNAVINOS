import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { notificationService } from '@/services/notificationService'

// Bell in the header, opening the Notifications page. Shown only to Section
// Admins - the same rule the sidebar entry and the route follow, since
// payment reminders are addressed to them. Rendering it for anyone else would
// be a button that lands on /unauthorized.
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isSectionAdmin = Boolean(user?.scoped_section)

  const { data: unread = 0 } = useQuery({
    // Same key NotificationsPage invalidates after reading or marking all, so
    // the badge clears without a reload.
    queryKey: ['notifications-unread'],
    queryFn: notificationService.unreadCount,
    // A reminder arrives while you're on another page, so the count has to
    // come to you rather than waiting for a navigation.
    refetchInterval: 60_000,
    enabled: isSectionAdmin,
  })

  if (!isSectionAdmin) return null

  const label = unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'

  return (
    <button
      type="button"
      onClick={() => navigate('/notifications')}
      title={label}
      aria-label={label}
      className="relative rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <Bell className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      {unread > 0 && (
        // Count rather than a plain dot: "you have some" is less use than
        // "you have three". Caps at 9+ so a long number can't stretch the
        // badge across the icon.
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
