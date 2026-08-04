import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { getLandingPath, isNavItemVisible, NAV_ITEMS } from '@/constants/navigation'

const DASHBOARD_ITEM = NAV_ITEMS.find((item) => item.to === '/')

// Decides what "/" means per user. Driven by the same visibility rules the
// sidebar uses, rather than a hardcoded role list that could disagree with
// it: if the Dashboard isn't in your nav, you get your first real page
// instead of an overview you were never meant to see.
export function HomeRoute() {
  const { user, hasPermission } = useAuth()
  const context = { user, hasPermission }

  if (isNavItemVisible(DASHBOARD_ITEM, context)) return <DashboardPage />

  const landingPath = getLandingPath(context)
  // A user with no visible pages at all has nothing to be redirected to -
  // send them somewhere that explains itself instead of looping on "/".
  return <Navigate to={landingPath ?? '/unauthorized'} replace />
}
