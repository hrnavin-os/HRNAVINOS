import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { StatCard } from '@/components/dashboard/StatCard'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCurrency } from '@/utils/formatters'
import { useAuth } from '@/hooks/useAuth'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: dashboardService.getOverview,
  })

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Welcome back, {user?.first_name}</h1>
      <p className="mt-1 text-sm text-slate-500">Here's what's happening across the institute today.</p>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={getApiErrorMessage(error)} />}

      {data && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Students" value={data.total_students} />
          <StatCard label="Active Students" value={data.active_students} tone="brand" />
          <StatCard label="Total Leads" value={data.total_leads} />
          <StatCard label="New Leads" value={data.new_leads} />
          <StatCard label="Ongoing Batches" value={data.ongoing_batches} />
          <StatCard label="Total Tutors" value={data.total_tutors} />
          <StatCard label="Pending Payments" value={data.pending_payments} />
          <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} tone="brand" />
          <StatCard label="Open Tickets" value={data.open_tickets} />
          <StatCard label="Students Placed" value={`${data.students_placed} / ${data.total_placements}`} />
        </div>
      )}
    </div>
  )
}
