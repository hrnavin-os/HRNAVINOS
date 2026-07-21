import { apiClient } from '@/services/apiClient'

export const settingsService = {
  get: async () => (await apiClient.get('/settings')).data,
  update: async (payload) => (await apiClient.put('/settings', payload)).data,
}
