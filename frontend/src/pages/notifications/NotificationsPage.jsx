import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BellOff,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  ListChecks,
  Trash2,
} from 'lucide-react'
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

// A div wrapping its own buttons rather than one big button: the card carries
// a delete control and a selection checkbox now, and a button nested inside a
// button is invalid HTML - the browser discards the inner one.
function NotificationCard({ notification, onOpen, onDelete, isBusy, isDeleting, selectMode, isSelected, onToggle }) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.info
  const Icon = style.icon
  const isUnread = !notification.is_read

  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isSelected ? 'border-brand-400 ring-2 ring-brand-200' : isUnread ? style.ring : 'border-slate-200'
      } ${isDeleting ? 'opacity-50' : ''}`}
    >
      {isUnread && <div className={`absolute inset-0 -z-10 bg-linear-to-br ${style.wash} to-transparent`} />}

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {selectMode ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(notification.id)}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            aria-label={`Select ${notification.title}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => onDelete(notification.id)}
            disabled={isDeleting}
            title="Delete this notification"
            aria-label={`Delete ${notification.title}`}
            className="rounded-md p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-wait"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="button"
        // Picks rather than opens while selecting, so a stray click can't
        // navigate away and lose the selection.
        onClick={() => (selectMode ? onToggle(notification.id) : onOpen(notification))}
        disabled={isBusy || isDeleting}
        className="flex h-full flex-col p-4 pr-9 text-left disabled:cursor-wait"
      >
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
          {notification.lead_id && !selectMode && (
            <span className="font-medium text-brand-600 group-hover:text-brand-700">Open &amp; follow up →</span>
          )}
        </div>
      </button>
    </div>
  )
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState([])

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
        // Explicitly Foundation, and straight into that candidate's popup -
        // see NotificationBell.
        navigate(`/leads?board=foundation&lead=${notification.lead_id}`)
      }
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: refresh,
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => notificationService.remove(id),
    onSuccess: refresh,
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => notificationService.removeMany(ids),
    onSuccess: () => {
      refresh()
      setSelectMode(false)
      setSelected([])
    },
  })

  const toggleSelected = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  const notifications = query.data?.items ?? []
  const unreadCount = notifications.filter((notification) => !notification.is_read).length
  const allSelected = notifications.length > 0 && selected.length === notifications.length

  if (query.isLoading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {selectMode ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : notifications.map((item) => item.id))}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {selected.length > 0 ? `${selected.length} selected` : 'Select all'}
          </label>
        ) : (
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? (
              <>
                <span className="font-semibold text-slate-900 tabular-nums">{unreadCount}</span> unread
              </>
            ) : (
              'You are all caught up.'
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {selectMode ? (
            <>
              <Button
                variant="danger"
                onClick={() => bulkDeleteMutation.mutate(selected)}
                disabled={selected.length === 0 || bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete${selected.length ? ` (${selected.length})` : ''}`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectMode(false)
                  setSelected([])
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {unreadCount > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                >
                  <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  {markAllMutation.isPending ? 'Marking…' : 'Mark all read'}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button variant="secondary" onClick={() => setSelectMode(true)}>
                  <ListChecks className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Select
                </Button>
              )}
            </>
          )}
        </div>
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
              onDelete={(id) => deleteMutation.mutate(id)}
              isBusy={openMutation.isPending && openMutation.variables?.id === notification.id}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === notification.id}
              selectMode={selectMode}
              isSelected={selected.includes(notification.id)}
              onToggle={toggleSelected}
            />
          ))}
        </div>
      )}
    </div>
  )
}
