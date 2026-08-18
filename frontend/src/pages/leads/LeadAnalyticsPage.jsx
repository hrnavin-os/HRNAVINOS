import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, Megaphone, PhoneCall, TrendingUp, Users } from 'lucide-react'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { DateFilter } from '@/components/ui/DateFilter'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { TabStrip } from '@/components/ui/TabStrip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { FunnelBoard } from '@/components/analytics/boards/FunnelBoard'
import { CallsBoard } from '@/components/analytics/boards/CallsBoard'
import { TeamBoard } from '@/components/analytics/boards/TeamBoard'
import { ChannelsBoard } from '@/components/analytics/boards/ChannelsBoard'
import { TrendBoard } from '@/components/analytics/boards/TrendBoard'

// Five boards, each answering one decision rather than one dimension.
//
// The page used to be four tabs of "count by field", which is a breakdown, not
// a dashboard - it could say how many Freshers there were but not whether the
// calling was keeping up, who was being left behind, or whether last month was
// better than this one. A board is named for the question it settles.
const BOARDS = [
  { key: 'funnel', label: 'Funnel', icon: Filter },
  { key: 'calls', label: 'Calls', icon: PhoneCall },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'channels', label: 'Channels', icon: Megaphone },
  { key: 'trend', label: 'Trend', icon: TrendingUp },
]

export function LeadAnalyticsPage() {
  const { user } = useAuth()
  // A Section Admin is pinned to their own section by their role, exactly as
  // on the board - so the slicer isn't offered to them at all rather than
  // being offered and ignored.
  const scopedSection = user?.scoped_section || null

  const [board, setBoard] = useState('funnel')
  const [dateRange, setDateRange] = useState(null)
  const [section, setSection] = useState('')

  const configQuery = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })
  const sections = configQuery.data?.sections ?? []

  // One request for all five boards. Five would let them refresh out of step,
  // and a screen where the funnel already answers for last month while the
  // trend still answers for last year is worse than a slow one.
  const params = {
    date_from: dateRange?.from || undefined,
    date_to: dateRange?.to || undefined,
    section: section || undefined,
  }
  const query = useQuery({
    queryKey: ['induction-dashboard', params],
    queryFn: () => inductionEntryService.getDashboard(params),
    // Holds the previous numbers while the next load, so moving a slicer
    // doesn't collapse the page to a spinner and back.
    placeholderData: (previous) => previous,
  })

  const data = query.data

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
          <p className="mt-0.5 text-sm text-amber-600">
            Induction call insights &amp; candidate categorization
          </p>
        </div>
        <TabStrip equal tabs={BOARDS} value={board} onChange={setBoard} className="min-w-0 flex-1 basis-lg" />
      </div>

      {/* The slicer bar. One window and one section for all five boards, so
          two boards on the same screen can never be describing different
          populations - the failure that makes a dashboard untrustworthy
          rather than merely wrong. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Showing</span>
        <div className="w-56">
          <DateFilter grow label="Registration date" value={dateRange} onChange={setDateRange} />
        </div>
        {!scopedSection && (
          <div className="w-44">
            <FilterDropdown
              grow
              label="Section"
              value={section}
              options={sections.map((item) => ({ value: item.code, label: item.label }))}
              onChange={setSection}
            />
          </div>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {data ? `${data.total} candidate${data.total === 1 ? '' : 's'} in scope` : '—'}
        </span>
      </div>

      <ErrorMessage message={query.error ? getApiErrorMessage(query.error) : null} />

      {query.isLoading && !data ? (
        <LoadingSpinner />
      ) : data ? (
        // Dimmed rather than replaced while refetching, so the page doesn't
        // jump between a skeleton and content every time a slicer moves.
        <div className={query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {board === 'funnel' && <FunnelBoard funnel={data.funnel} />}
          {board === 'calls' && <CallsBoard calls={data.calls} total={data.total} />}
          {board === 'team' && <TeamBoard team={data.team} />}
          {board === 'channels' && <ChannelsBoard channels={data.channels} />}
          {board === 'trend' && <TrendBoard trend={data.trend} />}
        </div>
      ) : null}
    </div>
  )
}
