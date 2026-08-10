import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BellOff, CheckCheck, CircleAlert, Info, CircleCheck } from 'lucide-react'
import { notificationService } from '@/services/notificationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatDateTime } from '@/utils/formatters'

// Accent per notification type. The icon carries it as well as the colour, so
// a warning is still distinguishable without relying on hue alone.
const TYPE_STYLES = {
  info: { icon: Info, plate: 'bg-linear-to-br from-blue-500 to-blue-700', ring: 'border-blue-100', wash: 'from-blue-50/70' },
  success: {
    icon: CircleCheck,
    plate: 'bg-linear-to-br from-emerald-500 to-emerald-700',
    ring: 'border-emerald-100',
    wash: 'from-emerald-50/70',
  },
  warning: {
    icon: AlertTriangle,
    plate: 'bg-linear-to-br from-amber-500 to-amber-700',
    ring: 'border-amber-100',
    wash: 'from-amber-50/70',
  },
  error: { icon: CircleAlert, plate: 'bg-linear-to-br from-red-500 to-red-700', ring: 'border-red-100', wash: 'from-red-50/70' },
}

function NotificationCard({ notification, onOpen, isBusy }) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.info
  const Icon = style.icon
  const isUnread = !notification.is_read

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      disabled={isBusy}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60 ${
        isUnread ? style.ring : 'border-slate-200'
      }`}
    >
      {isUnread && <div className={`absolute inset-0 -z-10 bg-linear-to-br ${style.wash} to-transparent`} />}

      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${style.plate}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug text-slate-900">{notification.title}</p>
            {/* A dot rather than an "Unread" chip - the row is already tinted,
                and a word here competes with the title. */}
            {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{notification.message}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-slate-400">
        <span>{formatDateTime(notification.created_at)}</span>
        {notification.lead_id && (
          <span className="font-medium text-brand-600 group-hover:text-brand-700">Open &amp; follow up →</span>
        )}
      </div>
    </button>
  )
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ page_size: 100 }),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
  }

  // Acknowledging a lead-linked notification moves that lead to Follow up
  // call, so the lead lists have to be refetched too or the board still shows
  // the old stage.
  const openMutation = useMutation({
    mutationFn: (notification) => notificationService.acknowledge(notification.id),
    onSuccess: (_data, notification) => {
      refresh()
      if (notification.lead_id) {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
        // Explicitly Foundation - see NotificationBell: a lead_id is always a
        // Lead, which the Induction board cannot show.
        navigate('/leads?board=foundation')
      }
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: refresh,
  })

  const notifications = query.data?.items ?? []
  const unreadCount = notifications.filter((notification) => !notification.is_read).length

  if (query.isLoading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {unreadCount > 0 ? (
            <>
              <span className="font-semibold text-slate-900 tabular-nums">{unreadCount}</span> unread
            </>
          ) : (
            'You are all caught up.'
          )}
        </p>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
            <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {markAllMutation.isPending ? 'Marking…' : 'Mark all read'}
          </Button>
        )}
      </div>

      <ErrorMessage
        message={
          query.error
            ? getApiErrorMessage(query.error)
            : openMutation.error
              ? getApiErrorMessage(openMutation.error)
              : markAllMutation.error
                ? getApiErrorMessage(markAllMutation.error)
                : null
        }
      />

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white p-14 text-center shadow-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <BellOff className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="text-sm text-slate-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onOpen={(item) => openMutation.mutate(item)}
              isBusy={openMutation.isPending && openMutation.variables?.id === notification.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
