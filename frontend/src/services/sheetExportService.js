import { apiClient } from '@/services/apiClient'

// The Settings menu's Google Sheets export: where the Induction and Foundation
// boards are mirrored to, and how the last run went. Every call answers with
// the whole status, so the page never has to stitch two responses together.
export const sheetExportService = {
  get: async () => (await apiClient.get('/integrations/sheet-export')).data,
  update: async (payload) => (await apiClient.put('/integrations/sheet-export', payload)).data,
  run: async () => (await apiClient.post('/integrations/sheet-export/run')).data,
}
