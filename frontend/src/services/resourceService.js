import { apiClient } from '@/services/apiClient'

// Factory for the standard paginated-CRUD REST pattern every ERP module follows.
export function createResourceService(basePath) {
  return {
    list: async (params = {}) => {
      const { data } = await apiClient.get(basePath, { params })
      return data
    },
    get: async (id) => {
      const { data } = await apiClient.get(`${basePath}/${id}`)
      return data
    },
    create: async (payload) => {
      const { data } = await apiClient.post(basePath, payload)
      return data
    },
    update: async (id, payload) => {
      const { data } = await apiClient.put(`${basePath}/${id}`, payload)
      return data
    },
    // `reason` is sent as a DELETE body rather than a query param: it is
    // free text somebody types, and typed prose does not belong in a URL that
    // ends up in access logs and browser history. Endpoints that don't ask
    // for one ignore it.
    remove: async (id, reason) => {
      const { data } = await apiClient.delete(`${basePath}/${id}`, {
        data: reason ? { reason } : undefined,
      })
      return data
    },
  }
}
