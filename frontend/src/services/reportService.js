import { apiClient } from '@/services/apiClient'

export const reportService = {
  revenue: async () => (await apiClient.get('/reports/revenue')).data,
  admissions: async () => (await apiClient.get('/reports/admissions')).data,
  attendance: async () => (await apiClient.get('/reports/attendance')).data,
  leadConversion: async () => (await apiClient.get('/reports/lead-conversion')).data,
}
