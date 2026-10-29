import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Every Student Portal query, refetched together. An attendance mark changes
// the class's roll, the batch's totals, the student's own page and the batch
// list's counts at once - refreshing only the view the change was made in
// leaves the others showing a figure that is already wrong.
const PORTAL_QUERY_KEYS = ['portal-batches', 'portal-batch', 'portal-register', 'portal-session', 'portal-student']

export function usePortalRefresh() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    for (const key of PORTAL_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] })
  }, [queryClient])
}
