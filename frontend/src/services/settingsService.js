import { apiClient } from '@/services/apiClient'

export const settingsService = {
  get: async () => (await apiClient.get('/settings')).data,
  update: async (payload) => (await apiClient.put('/settings', payload)).data,
  // Super Admin only, and the server checks the phrase again - this is a
  // convenience for the UI, not the guard.
  resetLeads: async (confirm) => (await apiClient.post('/settings/reset-leads', { confirm })).data,
}
