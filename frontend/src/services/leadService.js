import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const leadService = {
  ...createResourceService('/leads'),
  assign: async (id, assignedTo) => {
    const { data } = await apiClient.post(`/leads/${id}/assign`, { assigned_to: assignedTo })
    return data
  },
  getStats: async () => {
    const { data } = await apiClient.get('/leads/stats')
    return data
  },
  getTimeline: async (id) => {
    const { data } = await apiClient.get(`/leads/${id}/timeline`)
    return data
  },
  getPendingReview: async () => {
    const { data } = await apiClient.get('/leads/pending-review')
    return data
  },
  review: async (id, values) => {
    const { data } = await apiClient.post(`/leads/${id}/review`, values)
    return data
  },
  uploadPaymentInfo: async (id, { file, paidAmount, paymentMode }) => {
    const formData = new FormData()
    if (file) formData.append('file', file)
    if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
      formData.append('paid_amount', paidAmount)
    }
    if (paymentMode) formData.append('payment_mode', paymentMode)
    const { data } = await apiClient.post(`/leads/${id}/payment-image`, formData, {
      headers: { 'Content-Type': undefined },
    })
    return data
  },
}
