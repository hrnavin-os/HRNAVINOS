import { apiClient } from '@/services/apiClient'

export const dashboardService = {
  getOverview: async () => {
    const { data } = await apiClient.get('/dashboard/overview')
    return data
  },
}
