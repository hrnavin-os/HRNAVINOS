import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const inductionEntryService = {
  ...createResourceService('/induction-entries'),
  // Counts behind the board's stat cards.
  //
  // Takes the same filter row list() does, because the cards are a summary of
  // the rows under them: filter to one assignee and the cards have to say how
  // many of *their* students are pending, moved and quit. They used to count
  // the whole board, which read as a contradiction the moment any filter was
  // on - 30 above a table showing 2.
  //
  // `status` is deliberately not part of `filters`: it picks which card is
  // highlighted, while the response counts all three tabs at once.
  getStats: async (status, filters = {}) => {
    const { data } = await apiClient.get('/induction-entries/stats', {
      params: { ...(status ? { status } : {}), ...filters },
    })
    return data
  },
  // Distinct values present in the data, so a filter never offers an option
  // that matches nothing - including values typed into the form's comboboxes
  // that aren't on the configured dropdown list.
  // Counts per distinct category or call remark, aggregated server-side for
  // the analytics dashboard.
  // `filters` is the dashboard's filter rail - a registration-date window and
  // a section - applied inside the aggregation so every view on the canvas is
  // counting the same population.
  getAnalytics: async (dimension, filters = {}) => {
    const { data } = await apiClient.get('/induction-entries/analytics', {
      params: { dimension, ...filters },
    })
    return data
  },
  getFilterOptions: async (status) => {
    const { data } = await apiClient.get('/induction-entries/filter-options', {
      params: status ? { status } : {},
    })
    return data
  },
  // The post-call form's four pages, including the recording's Drive link -
  // there's no separate upload call any more, the link saves with the rest of
  // the form.
  updateDetails: async (id, payload) => {
    const { data } = await apiClient.put(`/induction-entries/${id}/details`, payload)
    return data
  },
}
