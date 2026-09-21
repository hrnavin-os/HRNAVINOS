import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiErrorMessage } from '@/services/apiClient'

// Exposed on the return value so callers that need a row's position within the
// full result set (e.g. a serial-number column) can offset by page without
// re-declaring the size here.
const PAGE_SIZE = 20

export function usePaginatedQuery(queryKey, service, extraParams = {}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // A page number belongs to the view it was set on, and every param here
  // names a different view: a tab, a filter, a date window, a sort.
  //
  // Page 2 of the induction queue is not page 2 of the one candidate who quit.
  // Kept across the switch, it asked the server for rows 21-40 of a set that
  // holds one, and the Quit tab opened on an empty table under "Showing 21-1
  // of 1" - a board that looks broken while working exactly as told.
  //
  // Serialised rather than compared by identity: callers build this object
  // inline, so it is a new object on every render and never equal to the last
  // one. Every value in it is a primitive or undefined, which is what makes
  // the string stable between renders that changed nothing.
  const scope = JSON.stringify(extraParams)
  const [lastScope, setLastScope] = useState(scope)
  // Adjusted while rendering rather than in an effect. An effect runs after
  // the commit, so the stale page would be fetched and painted first and only
  // then corrected; React re-renders from here before any of it is shown, and
  // `activePage` keeps even the discarded render from asking for a page the
  // new view hasn't got.
  const moved = scope !== lastScope
  if (moved) {
    setLastScope(scope)
    setPage(1)
  }
  const activePage = moved ? 1 : page

  const query = useQuery({
    queryKey: [queryKey, activePage, search, extraParams],
    queryFn: () =>
      service.list({ page: activePage, page_size: PAGE_SIZE, search: search || undefined, ...extraParams }),
    placeholderData: (previousData) => previousData,
  })

  // Never below one, because an empty result set reports no pages at all and
  // "page 0" is not somewhere the footer can count from.
  const totalPages = Math.max(query.data?.total_pages ?? 1, 1)
  // The other way a page stops existing: deleting the last row of the last
  // page. Only once there are real numbers to judge against - mid-flight the
  // count still belongs to the view being left.
  if (query.data && activePage > totalPages) setPage(totalPages)

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    totalPages,
    page: activePage,
    pageSize: PAGE_SIZE,
    setPage,
    search,
    setSearch,
    isLoading: query.isLoading,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch: query.refetch,
  }
}
