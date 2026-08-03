import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function ProtectedRoute({ permission, blockScoped }) {
  const { isAuthenticated, isLoading, hasPermission, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/unauthorized" replace />
  }

  // Section Admins are scoped to their own section's leads and shouldn't
  // reach section-agnostic pages like Form Collection, even via direct URL.
  if (blockScoped && user?.scoped_section) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
