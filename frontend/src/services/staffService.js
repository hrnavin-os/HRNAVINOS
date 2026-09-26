import { apiClient } from '@/services/apiClient'

// The Staffs directory: read-only, full profiles. Adding and editing staff
// goes through userService - the records are the Users menu's.
export const staffService = {
  list: async (params = {}) => {
    const { data } = await apiClient.get('/staffs', { params })
    return data
  },
  get: async (id) => {
    const { data } = await apiClient.get(`/staffs/${id}`)
    return data
  },
}
