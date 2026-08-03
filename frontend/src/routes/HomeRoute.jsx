import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ROLES_WITHOUT_DASHBOARD } from '@/constants/layout'

// Roles with no use for the generic Dashboard — send them straight to their
// actual working page instead of the generic overview.
export function HomeRoute() {
  const { user } = useAuth()
  if (ROLES_WITHOUT_DASHBOARD.includes(user?.role)) {
    return <Navigate to="/leads" replace />
  }
  return <DashboardPage />
}
