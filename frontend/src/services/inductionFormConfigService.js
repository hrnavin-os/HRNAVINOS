import { apiClient } from '@/services/apiClient'

export const inductionFormConfigService = {
  get: async () => {
    const { data } = await apiClient.get('/induction-form/config')
    return data
  },
  update: async (payload) => {
    const { data } = await apiClient.put('/induction-form/config', payload)
    return data
  },
  // Unauthenticated twin, used by the public form to describe itself before
  // anyone has logged in.
  getPublic: async () => {
    const { data } = await apiClient.get('/public/induction-form/config')
    return data
  },
}
