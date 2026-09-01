import { apiClient } from '@/services/apiClient'

// The induction Attendance board. Its students are induction entries, not
// Student records - everyone who came through an induction call is asked to
// sign the terms and to turn up, whether or not they have reached a batch yet.
//
// Distinct from the classroom attendance a Tutor marks against a batch, which
// is the /attendance module.
export const attendanceBoardService = {
  getTermsDocument: async () => {
    const { data } = await apiClient.get('/induction-attendance/terms-document')
    return data
  },
  updateTermsDocument: async ({ title, body }) => {
    const { data } = await apiClient.put('/induction-attendance/terms-document', { title, body })
    return data
  },
  // `marker` is the tab ('terms' | 'polls' | 'success_meet' | 'foundation_class')
  // and `state` which side of it ('all' | 'yes' | 'no'). Shaped like the other
  // list services so usePaginatedQuery can drive it unchanged.
  list: async (params) => {
    const { data } = await apiClient.get('/induction-attendance/students', { params })
    return data
  },
  // Every marker's split in one response, so each tab shows its own count
  // without a request each.
  getStats: async () => {
    const { data } = await apiClient.get('/induction-attendance/stats')
    return data
  },
  // `marked` is true, false, or null to clear the tick - which on the
  // foundation class hands the row back to what the Foundation link says.
  setMark: async (id, marker, marked) => {
    const { data } = await apiClient.put(`/induction-attendance/students/${id}/marks/${marker}`, { marked })
    return data
  },
}
