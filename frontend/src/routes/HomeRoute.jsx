import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ROLES_WITHOUT_SIDEBAR } from '@/constants/layout'

// Roles without a sidebar have no use for the Dashboard either — send them
// straight to their actual working page instead of the generic overview.
export function HomeRoute() {
  const { user } = useAuth()
  if (ROLES_WITHOUT_SIDEBAR.includes(user?.role)) {
    return <Navigate to="/leads" replace />
  }
  return <DashboardPage />
}
