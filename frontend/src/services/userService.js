import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const userService = {
  ...createResourceService('/users'),
  // One ID copy or certificate for the Users form's ID & Docs section.
  // Uploaded ahead of the save; the returned url is saved with the user.
  uploadDocument: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await apiClient.post('/users/documents', formData, {
      headers: { 'Content-Type': undefined },
    })
    return data
  },
}
