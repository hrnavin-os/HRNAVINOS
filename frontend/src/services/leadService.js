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
  // Every course a lead can be moved onto - the live programs, plus any
  // value already in the data that is no longer one. Distinct from
  // getCourseOptions, which is what is in use and is what the filter wants.
  getCourseCatalog: async () => {
    const { data } = await apiClient.get('/leads/course-catalog')
    return data
  },
  getTimeline: async (id) => {
    const { data } = await apiClient.get(`/leads/${id}/timeline`)
    return data
  },
  // The Induction Call Form entry this lead was matched to on mobile number,
  // or null. Fetched on demand rather than embedded in the lead, since only
  // the detail view shows it.
  getInduction: async (id) => {
    const { data } = await apiClient.get(`/leads/${id}/induction`)
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
  // Asks the lead's section admins to chase an outstanding payment.
  // kind: 'due' | 'emi' | 'after_placement'.
  sendPaymentReminder: async (id, { kind, note }) => {
    const { data } = await apiClient.post(`/leads/${id}/payment-reminder`, { kind, note: note || null })
    return data
  },
  // Finance declaring the money isn't coming. Goes to the HR Coordinators,
  // whose removal of the student from the batch group is what marks them Lost.
  reportNonPayment: async (id, { amount, note } = {}) => {
    const { data } = await apiClient.post(`/leads/${id}/non-payment`, {
      amount: amount ?? null,
      note: note || null,
    })
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
  markLost: async (id) => {
    const { data } = await apiClient.post(`/leads/${id}/mark-lost`)
    return data
  },
}
