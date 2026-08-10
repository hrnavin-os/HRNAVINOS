import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const inductionEntryService = {
  ...createResourceService('/induction-entries'),
  // Counts behind the board's stat cards. Separate from list() so the cards
  // show every section's total regardless of which one is filtered to.
  getStats: async () => {
    const { data } = await apiClient.get('/induction-entries/stats')
    return data
  },
  // Distinct values present in the data, so a filter never offers an option
  // that matches nothing - including values typed into the form's comboboxes
  // that aren't on the configured dropdown list.
  getFilterOptions: async () => {
    const { data } = await apiClient.get('/induction-entries/filter-options')
    return data
  },
  // The post-call form's four pages. Separate from update(), which edits the
  // entry's own fields.
  updateDetails: async (id, payload) => {
    const { data } = await apiClient.put(`/induction-entries/${id}/details`, payload)
    return data
  },
  uploadCallRecording: async (id, file) => {
    const body = new FormData()
    body.append('file', file)
    const { data } = await apiClient.post(`/induction-entries/${id}/call-recording`, body)
    return data
  },
}
