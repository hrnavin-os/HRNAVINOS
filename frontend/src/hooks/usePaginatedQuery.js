import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiErrorMessage } from '@/services/apiClient'

export function usePaginatedQuery(queryKey, service, extraParams = {}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const query = useQuery({
    queryKey: [queryKey, page, search, extraParams],
    queryFn: () => service.list({ page, page_size: 20, search: search || undefined, ...extraParams }),
    placeholderData: (previousData) => previousData,
  })

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.total_pages ?? 1,
    page,
    setPage,
    search,
    setSearch,
    isLoading: query.isLoading,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch: query.refetch,
  }
}
