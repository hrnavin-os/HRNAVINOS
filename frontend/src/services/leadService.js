import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const leadService = {
  ...createResourceService('/leads'),
  assign: async (id, assignedTo) => {
    const { data } = await apiClient.post(`/leads/${id}/assign`, { assigned_to: assignedTo })
    return data
  },
}
