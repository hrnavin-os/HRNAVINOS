import { apiClient } from '@/services/apiClient'

const BASE = '/batch-confirmation'

// Not built on createResourceService: this module is a workflow, not a
// paginated CRUD collection - the endpoints are verbs (allocate, withdraw,
// confirm) over Leads and Batches rather than a resource of its own.
export const batchConfirmationService = {
  summary: async () => {
    const { data } = await apiClient.get(`${BASE}/summary`)
    return data
  },
  pendingLeads: async () => {
    const { data } = await apiClient.get(`${BASE}/pending-leads`)
    return data
  },
  batches: async () => {
    const { data } = await apiClient.get(`${BASE}/batches`)
    return data
  },
  batch: async (batchId) => {
    const { data } = await apiClient.get(`${BASE}/batches/${batchId}`)
    return data
  },
  allocations: async (status) => {
    const { data } = await apiClient.get(`${BASE}/allocations`, { params: status ? { status } : {} })
    return data
  },
  markLead: async (leadId, marked) => {
    const { data } = await apiClient.post(`${BASE}/leads/${leadId}/mark`, { marked })
    return data
  },
  options: async () => {
    const { data } = await apiClient.get(`${BASE}/options`)
    return data
  },
  createBatch: async (payload) => {
    const { data } = await apiClient.post(`${BASE}/batches`, payload)
    return data
  },
  allocate: async (payload) => {
    const { data } = await apiClient.post(`${BASE}/allocations`, payload)
    return data
  },
  withdraw: async (allocationId, reason) => {
    const { data } = await apiClient.post(`${BASE}/allocations/${allocationId}/withdraw`, { reason })
    return data
  },
  confirm: async (batchId) => {
    const { data } = await apiClient.post(`${BASE}/batches/${batchId}/confirm`)
    return data
  },
  hrStudents: async (tab) => {
    const { data } = await apiClient.get(`${BASE}/students`, { params: { tab } })
    return data
  },
  setBatchNumber: async (leadId, batchNumber) => {
    const { data } = await apiClient.put(`${BASE}/students/${leadId}/batch-number`, {
      batch_number: batchNumber,
    })
    return data
  },
  markGroupAssigned: async (leadId, assigned = true) => {
    const { data } = await apiClient.post(`${BASE}/students/${leadId}/group-assigned`, { assigned })
    return data
  },
  markGroupAssignedBulk: async (leadIds) => {
    const { data } = await apiClient.post(`${BASE}/students/group-assigned/bulk`, { lead_ids: leadIds })
    return data
  },
  setHrStage: async (leadId, status, lostReason) => {
    const { data } = await apiClient.post(`${BASE}/students/${leadId}/stage`, {
      status,
      lost_reason: lostReason ?? null,
    })
    return data
  },
  whatsappLinks: async () => {
    const { data } = await apiClient.get(`${BASE}/whatsapp-links`)
    return data
  },
  updateWhatsappLink: async (code, whatsappGroupUrl) => {
    const { data } = await apiClient.put(`${BASE}/whatsapp-links/${code}`, {
      whatsapp_group_url: whatsappGroupUrl,
    })
    return data
  },
}
