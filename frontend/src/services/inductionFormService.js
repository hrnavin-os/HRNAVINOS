import { apiClient } from '@/services/apiClient'

// Public, unauthenticated - the shareable Induction Call Form posts here.
export const inductionFormService = {
  submit: async (payload) => {
    const { data } = await apiClient.post('/public/induction-form/submit', payload)
    return data
  },
}
