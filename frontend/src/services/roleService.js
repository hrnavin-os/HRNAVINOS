import { apiClient } from '@/services/apiClient'
import { createResourceService } from '@/services/resourceService'

export const roleService = {
  ...createResourceService('/roles'),
  // The Admin team's designations - Admin Head, Section Admin, Attendance
  // Coordinator, Operation Coordinator - each with the permission codes it is
  // given. The role editor fills a role from one.
  designations: async () => {
    const { data } = await apiClient.get('/roles/designations')
    return data
  },
}
