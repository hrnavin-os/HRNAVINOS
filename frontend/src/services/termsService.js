import { apiClient } from '@/services/apiClient'

// The Terms & Conditions register. Its students are induction entries, not
// Student records - everyone who came through an induction call owes a signed
// form, whether or not they have reached a batch yet.
export const termsService = {
  getDocument: async () => {
    const { data } = await apiClient.get('/terms/document')
    return data
  },
  updateDocument: async ({ title, body }) => {
    const { data } = await apiClient.put('/terms/document', { title, body })
    return data
  },
  // `filter` is the tab: 'all' | 'signed' | 'not_signed'. Shaped like the
  // other list services so usePaginatedQuery can drive it unchanged.
  list: async (params) => {
    const { data } = await apiClient.get('/terms/students', { params })
    return data
  },
  getStats: async () => {
    const { data } = await apiClient.get('/terms/students/stats')
    return data
  },
  // Both return the updated row, so the table can be patched in place rather
  // than refetching the page to learn one student moved tabs.
  markSigned: async (id) => {
    const { data } = await apiClient.post(`/terms/students/${id}/sign`)
    return data
  },
  markNotSigned: async (id) => {
    const { data } = await apiClient.delete(`/terms/students/${id}/sign`)
    return data
  },
}
