import { apiClient } from '@/services/apiClient'

export const settingsService = {
  get: async () => (await apiClient.get('/settings')).data,
  update: async (payload) => (await apiClient.put('/settings', payload)).data,
  // Super Admin only: whether the Admin role can delete Induction and
  // Foundation leads.
  getLeadDelete: async () => (await apiClient.get('/settings/lead-delete')).data,
  setLeadDelete: async (enabled) => (await apiClient.put('/settings/lead-delete', { enabled })).data,
  // Super Admin only, and the server checks the phrase again - this is a
  // convenience for the UI, not the guard.
  // scope is 'induction', 'foundation' or 'all', and the phrase the server
  // expects differs per scope - sending one board's phrase with another's
  // scope is refused.
  resetLeads: async (confirm, scope = 'all') =>
    (await apiClient.post('/settings/reset-leads', { confirm, scope })).data,
}
