import { apiClient } from '@/services/apiClient'

export const foundationFormService = {
  getPricing: async () => {
    const { data } = await apiClient.get('/public/foundation-form/pricing')
    return data
  },
  submit: async (values) => {
    const { data } = await apiClient.post('/public/foundation-form/submit', values)
    return data
  },
}
