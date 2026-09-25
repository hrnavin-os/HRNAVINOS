import { apiClient } from '@/services/apiClient'

export const dashboardService = {
  getOverview: async () => {
    const { data } = await apiClient.get('/dashboard/overview')
    return data
  },
  // The Super Admin dashboard: the Induction/Foundation funnel, the money and
  // the latest activity, in one call.
  getInsights: async () => {
    const { data } = await apiClient.get('/dashboard/insights')
    return data
  },
}
