import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const paymentService = {
  ...createResourceService('/payments'),
  verify: async (id, approve, rejectionReason) => {
    const { data } = await apiClient.post(`/payments/${id}/verify`, { approve, rejection_reason: rejectionReason })
    return data
  },
}
