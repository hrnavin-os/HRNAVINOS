import { apiClient } from '@/services/apiClient'

export const notificationService = {
  list: async (params = {}) => {
    const { data } = await apiClient.get('/notifications', { params })
    return data
  },
  unreadCount: async () => {
    const { data } = await apiClient.get('/notifications/unread-count')
    return data.unread_count
  },
  // Opening a notification. For a Finance payment reminder this also moves the
  // lead it points at to the Follow up call stage - see NotificationService
  // .acknowledge on the backend.
  acknowledge: async (id) => {
    const { data } = await apiClient.post(`/notifications/${id}/acknowledge`)
    return data
  },
  markAllRead: async () => {
    const { data } = await apiClient.post('/notifications/mark-all-read')
    return data
  },
  remove: async (id) => {
    const { data } = await apiClient.delete(`/notifications/${id}`)
    return data
  },
  // POST rather than DELETE: a body on a DELETE is legal but poorly supported
  // by proxies and some clients drop it silently.
  removeMany: async (ids) => {
    const { data } = await apiClient.post('/notifications/bulk-delete', { ids })
    return data
  },
}
