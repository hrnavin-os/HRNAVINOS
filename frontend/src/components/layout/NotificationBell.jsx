import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bell, BellOff, CheckCheck, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLeadBoard } from '@/hooks/useLeadBoard'
import { notificationService } from '@/services/notificationService'
import { formatDateTime } from '@/utils/formatters'

// Accent per notification type, carried by the icon as well as the colour so a
// warning is still distinguishable without relying on hue.
const TYPE_STYLES = {
  info: { icon: Info, plate: 'bg-blue-100 text-blue-600' },
  success: { icon: CircleCheck, plate: 'bg-emerald-100 text-emerald-600' },
  warning: { icon: AlertTriangle, plate: 'bg-amber-100 text-amber-600' },
  error: { icon: CircleAlert, plate: 'bg-red-100 text-red-600' },
}

function NotificationRow({ notification, onOpen, isBusy }) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.info
  const Icon = style.icon
  const isUnread = !notification.is_read

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      disabled={isBusy}
      className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
        isUnread ? 'bg-brand-50/50 hover:bg-brand-50' : 'hover:bg-slate-50'
      }`}
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.plate}`}>
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-snug text-slate-900">{notification.title}</span>
          {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{notification.message}</span>
        <span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(notification.created_at)}</span>
      </span>
    </button>
  )
}

// Bell in the header, opening an inline panel rather than navigating - a
// reminder is a glance, not a destination, and leaving the board to read one
// meant losing your place on it.
//
// Section Admins only: the same rule the sidebar entry and the route follow,
// since payment reminders are addressed to them.
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [board] = useLeadBoard()
  const queryClient = useQueryClient()
  const wrapperRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const isSectionAdmin = Boolean(user?.scoped_section)

  // Every notification is a Foundation payment reminder, so on the Lead
  // Dashboard the bell belongs to the Foundation board - opening one from
  // Induction only offers to send you somewhere that board can't show.
  // Tested against Foundation rather than Induction so a third board added
  // later hides it by default instead of inheriting a bell it can't serve.
  // Everywhere else in the app there is no board in play, so it always shows;
  // `/leads` is matched exactly because `/leads/form-collection` is a
  // different page that happens to share the prefix.
  const isOffBoard = pathname === '/leads' && board !== 'foundation'

  const { data: unread = 0 } = useQuery({
    // Same key the panel invalidates after reading, so the badge clears itself.
    queryKey: ['notifications-unread'],
    queryFn: notificationService.unreadCount,
    // A reminder arrives while you're on another page, so the count has to come
    // to you rather than wait for a navigation.
    refetchInterval: 60_000,
    enabled: isSectionAdmin && !isOffBoard,
  })

  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ page_size: 20 }),
    // Only fetched once the panel is opened - no reason to pull twenty rows on
    // every page load for a bell most people never click.
    enabled: isSectionAdmin && isOpen && !isOffBoard,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
  }

  const openMutation = useMutation({
    mutationFn: (notification) => notificationService.acknowledge(notification.id),
    onSuccess: (_data, notification) => {
      refresh()
      setIsOpen(false)
      // Acknowledging a payment reminder moves its lead to Follow up call, so
      // the lead lists have to refetch or the board still shows the old stage.
      if (notification.lead_id) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
        // Explicitly Foundation: a notification's lead_id is always a Lead,
        // and Induction entries are separate records. Bare /leads would open
        // the default board, which cannot contain the lead being chased.
        //
        // ?lead= opens that candidate's popup on arrival. Landing on the board
        // and leaving you to find the name yourself defeats the reminder -
        // the lead is frequently not even on the first page.
        navigate(`/leads?board=foundation&lead=${notification.lead_id}`)
      }
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: refresh,
  })

  // The bell renders null off-board but stays mounted, so an open panel would
  // still be open when you came back to Foundation.
  useEffect(() => {
    if (isOffBoard) setIsOpen(false)
  }, [isOffBoard])

  useEffect(() => {
    if (!isOpen) return undefined
    function onPointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  if (!isSectionAdmin || isOffBoard) return null

  const notifications = listQuery.data?.items ?? []
  const label = unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
        className={`relative rounded-md p-2 transition-colors ${
          isOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <Bell className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        {unread > 0 && (
          // A count rather than a plain dot: "you have some" is less use than
          // "you have three". Capped so a long number can't stretch the badge.
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-sm font-semibold text-slate-900">
              Notifications
              {unread > 0 && <span className="ml-1.5 font-normal text-slate-500">({unread} unread)</span>}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="px-3.5 py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3.5 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <BellOff className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </span>
                <p className="text-sm text-slate-500">You&rsquo;re all caught up.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={(item) => openMutation.mutate(item)}
                  isBusy={openMutation.isPending && openMutation.variables?.id === notification.id}
                />
              ))
            )}
          </div>

          {notifications.length > 0 && (
            // The full page still exists for history - the panel only holds
            // the most recent twenty.
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                navigate('/notifications')
              }}
              className="block w-full border-t border-slate-200 bg-slate-50 px-3.5 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-slate-100 hover:text-brand-700"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  )
}
