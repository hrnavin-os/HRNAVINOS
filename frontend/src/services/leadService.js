import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const leadService = {
  ...createResourceService('/leads'),
  assign: async (id, assignedTo) => {
    const { data } = await apiClient.post(`/leads/${id}/assign`, { assigned_to: assignedTo })
    return data
  },
  getStats: async (section) => {
    const { data } = await apiClient.get('/leads/stats', { params: section ? { section } : undefined })
    return data
  },
  getCourseOptions: async () => {
    const { data } = await apiClient.get('/leads/course-options')
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
  assignPlan: async (id, { programInterest, paymentPlan }) => {
    const { data } = await apiClient.post(`/leads/${id}/plan`, {
      program_interest: programInterest,
      payment_plan: paymentPlan,
    })
    return data
  },
  updateInstallment: async (id, index, { file, amount, mode, transactionId, upiId, scheduledAt }) => {
    const formData = new FormData()
    if (file) formData.append('file', file)
    if (amount !== undefined && amount !== null && amount !== '') formData.append('amount', amount)
    if (mode) formData.append('mode', mode)
    if (transactionId) formData.append('transaction_id', transactionId)
    if (upiId) formData.append('upi_id', upiId)
    if (scheduledAt) formData.append('scheduled_at', scheduledAt)
    const { data } = await apiClient.post(`/leads/${id}/installments/${index}`, formData, {
      headers: { 'Content-Type': undefined },
    })
    return data
  },
}
