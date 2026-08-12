import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Info,
  ListChecks,
  Trash2,
} from 'lucide-react'
import { notificationService } from '@/services/notificationService'
import { destinationFor } from '@/utils/notificationRouting'
import { formatDateTime } from '@/utils/formatters'

// Accent per notification type, carried by the icon as well as the colour so a
// warning is still distinguishable without relying on hue.
const TYPE_STYLES = {
  info: { icon: Info, plate: 'bg-blue-100 text-blue-600' },
  success: { icon: CircleCheck, plate: 'bg-emerald-100 text-emerald-600' },
  warning: { icon: AlertTriangle, plate: 'bg-amber-100 text-amber-600' },
  error: { icon: CircleAlert, plate: 'bg-red-100 text-red-600' },
}

// A row rather than one big button, because it now carries a delete control
// and a selection checkbox - a button inside a button is invalid HTML and the
// browser drops the inner one. The opening action keeps its own button around
// the text; the others are siblings.
function NotificationRow({ notification, onOpen, onDelete, isBusy, isDeleting, selectMode, isSelected, onToggle }) {
  const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.info
  const Icon = style.icon
  const isUnread = !notification.is_read

  return (
    <div
      className={`flex items-start gap-2 pr-2 transition-colors ${
        isSelected ? 'bg-brand-100/60' : isUnread ? 'bg-brand-50/50 hover:bg-brand-50' : 'hover:bg-slate-50'
      } ${isDeleting ? 'opacity-50' : ''}`}
    >
      {selectMode && (
        <label className="flex cursor-pointer items-start py-3 pl-3.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(notification.id)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            aria-label={`Select ${notification.title}`}
          />
        </label>
      )}
      <button
        type="button"
        // In selection mode the row picks rather than opens, so a stray click
        // can't navigate away mid-selection and lose what you'd ticked.
        onClick={() => (selectMode ? onToggle(notification.id) : onOpen(notification))}
        disabled={isBusy || isDeleting}
        className={`flex min-w-0 flex-1 items-start gap-3 py-3 text-left disabled:cursor-wait ${
          selectMode ? 'pl-0' : 'pl-3.5'
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
      {!selectMode && (
        // Always visible rather than revealed on hover: hover doesn't exist on
        // a touch screen, and a control you can only find with a mouse isn't
        // one everybody has.
        <button
          type="button"
          onClick={() => onDelete(notification.id)}
          disabled={isDeleting}
          title="Delete this notification"
          aria-label={`Delete ${notification.title}`}
          className="mt-3 shrink-0 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-wait"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

// Bell in the header, opening an inline panel rather than navigating - a
// reminder is a glance, not a destination, and leaving the board to read one
// meant losing your place on it.
//
// Always present, for every role, on every page. It used to hide itself unless
// you were a Section Admin sitting on the Foundation board, which was fine
// while payment reminders were the only kind - but reminders are now raised
// for follow-ups, scheduled installments and non-payment, and they reach
// whoever scheduled the call, whoever owns the lead, and the HR Coordinators.
// A bell that comes and goes is also a bell nobody learns the position of.
export function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wrapperRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  // Selection is off until asked for: the panel's job is reading notifications,
  // and a checkbox on every row by default makes the common case busier to
  // serve the rare one.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState([])

  const { data: unread = 0 } = useQuery({
    // Same key the panel invalidates after reading, so the badge clears itself.
    queryKey: ['notifications-unread'],
    queryFn: notificationService.unreadCount,
    // A reminder arrives while you're on another page, so the count has to come
    // to you rather than wait for a navigation.
    refetchInterval: 60_000,
  })

  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ page_size: 20 }),
    // Only fetched once the panel is opened - no reason to pull twenty rows on
    // every page load for a bell most people never click.
    enabled: isOpen,
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
        navigate(destinationFor(notification))
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

  function exitSelectMode() {
    setSelectMode(false)
    setSelected([])
  }

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

  const notifications = listQuery.data?.items ?? []
  const label = unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'
  const allSelected = notifications.length > 0 && selected.length === notifications.length

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
          {/* The header swaps wholesale in selection mode rather than growing
              a third row of controls - while you're picking things to delete,
              "Mark all read" is not what you came for. */}
          {selectMode ? (
            <div className="flex items-center justify-between gap-3 border-b border-brand-200 bg-brand-50 px-3.5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : notifications.map((item) => item.id))}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {selected.length > 0 ? `${selected.length} selected` : 'Select all'}
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => bulkDeleteMutation.mutate(selected)}
                  disabled={selected.length === 0 || bulkDeleteMutation.isPending}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  {bulkDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={exitSelectMode}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <p className="text-sm font-semibold text-slate-900">
                Notifications
                {unread > 0 && <span className="ml-1.5 font-normal text-slate-500">({unread} unread)</span>}
              </p>
              <div className="flex items-center gap-3">
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
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectMode(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    <ListChecks className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    Select
                  </button>
                )}
              </div>
            </div>
          )}

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
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isBusy={openMutation.isPending && openMutation.variables?.id === notification.id}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === notification.id}
                  selectMode={selectMode}
                  isSelected={selected.includes(notification.id)}
                  onToggle={toggleSelected}
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
