import { apiClient } from '@/services/apiClient'

const BASE = '/integrations/google-sheets'

export const googleSheetsService = {
  getStatus: async () => {
    const { data } = await apiClient.get(`${BASE}/status`)
    return data
  },
  getCredentials: async () => {
    const { data } = await apiClient.get(`${BASE}/credentials`)
    return data
  },
  updateCredentials: async (payload) => {
    const { data } = await apiClient.put(`${BASE}/credentials`, payload)
    return data
  },
  getAuthUrl: async () => {
    const { data } = await apiClient.get(`${BASE}/auth-url`)
    return data
  },
  fetchTabs: async (url) => {
    const { data } = await apiClient.post(`${BASE}/fetch-tabs`, { url })
    return data
  },
  syncNow: async () => {
    const { data } = await apiClient.post(`${BASE}/sync`)
    return data
  },
  disconnect: async () => {
    const { data } = await apiClient.delete(BASE)
    return data
  },
  removeSheet: async (spreadsheetId) => {
    const { data } = await apiClient.delete(`${BASE}/sheets/${spreadsheetId}`)
    return data
  },
}
