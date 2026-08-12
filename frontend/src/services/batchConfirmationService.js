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
  // WhatsApp group onboarding. Sending an invite and recording a join are
  // separate calls on purpose - see the note on the backend routes.
  whatsappQueue: async (status) => {
    const { data } = await apiClient.get(`${BASE}/whatsapp/queue`, { params: status ? { status } : {} })
    return data
  },
  whatsappCounts: async () => {
    const { data } = await apiClient.get(`${BASE}/whatsapp/counts`)
    return data
  },
  // Whether the Cloud API can send on its own, so the board can say which mode
  // it is in before anyone presses Send.
  whatsappConfig: async () => {
    const { data } = await apiClient.get(`${BASE}/whatsapp/config`)
    return data
  },
  sendWhatsappInvite: async (leadId) => {
    const { data } = await apiClient.post(`${BASE}/whatsapp/${leadId}/invite`)
    return data
  },
  sendWhatsappInviteBulk: async (leadIds) => {
    const { data } = await apiClient.post(`${BASE}/whatsapp/invite/bulk`, { lead_ids: leadIds })
    return data
  },
  markWhatsappJoined: async (leadId) => {
    const { data } = await apiClient.post(`${BASE}/whatsapp/${leadId}/joined`)
    return data
  },
  logWhatsappFollowUp: async (leadId) => {
    const { data } = await apiClient.post(`${BASE}/whatsapp/${leadId}/follow-up`)
    return data
  },
  // Takes a non-paying student off the board and marks them Lost. One call,
  // because they are one decision - see the backend service.
  removeFromGroup: async (leadId, reason) => {
    const { data } = await apiClient.post(`${BASE}/whatsapp/${leadId}/remove`, { reason: reason ?? null })
    return data
  },
  whatsappHistory: async (leadId) => {
    const { data } = await apiClient.get(`${BASE}/whatsapp/${leadId}/history`)
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
