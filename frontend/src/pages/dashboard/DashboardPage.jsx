import { useQuery } from '@tanstack/react-query'
import {
  Users,
  UserCheck,
  Target,
  Sparkles,
  BookOpen,
  GraduationCap,
  Clock,
  IndianRupee,
  LifeBuoy,
  Briefcase,
} from 'lucide-react'
import { dashboardService } from '@/services/dashboardService'
import { getApiErrorMessage } from '@/services/apiClient'
import { StatCard } from '@/components/dashboard/StatCard'
import { StatSection } from '@/components/dashboard/StatSection'
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
        <div className="mt-6">
          <StatSection title="Students & Academics">
            <StatCard label="Total Students" value={data.total_students} icon={Users} tone="blue" />
            <StatCard label="Active Students" value={data.active_students} icon={UserCheck} tone="emerald" />
            <StatCard label="Ongoing Batches" value={data.ongoing_batches} icon={BookOpen} tone="teal" />
            <StatCard label="Total Tutors" value={data.total_tutors} icon={GraduationCap} tone="orange" />
          </StatSection>

          <StatSection title="CRM & Admissions">
            <StatCard label="Total Leads" value={data.total_leads} icon={Target} tone="violet" />
            <StatCard label="New Leads" value={data.new_leads} icon={Sparkles} tone="pink" />
          </StatSection>

          <StatSection title="Finance">
            <StatCard label="Pending Payments" value={data.pending_payments} icon={Clock} tone="amber" />
            <StatCard
              label="Total Revenue"
              value={formatCurrency(data.total_revenue)}
              icon={IndianRupee}
              tone="emerald"
              featured
            />
          </StatSection>

          <StatSection title="Placement & Support">
            <StatCard
              label="Students Placed"
              value={`${data.students_placed} / ${data.total_placements}`}
              icon={Briefcase}
              tone="blue"
            />
            <StatCard label="Open Tickets" value={data.open_tickets} icon={LifeBuoy} tone="red" />
          </StatSection>
        </div>
      )}
    </div>
  )
}
