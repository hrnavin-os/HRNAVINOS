import { apiClient } from '@/services/apiClient'

export const foundationFormConfigService = {
  get: async () => {
    const { data } = await apiClient.get('/foundation-form/config')
    return data
  },
  update: async (payload) => {
    const { data } = await apiClient.put('/foundation-form/config', payload)
    return data
  },
  addSection: async () => {
    const { data } = await apiClient.post('/foundation-form/config/sections')
    return data
  },
  deleteSection: async (code) => {
    const { data } = await apiClient.delete(`/foundation-form/config/sections/${code}`)
    return data
  },
}
