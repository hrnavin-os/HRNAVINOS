import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { NAV_LEAF_ITEMS } from '@/constants/navigation'

function useCurrentPageTitle() {
  const { pathname } = useLocation()
  const match = NAV_LEAF_ITEMS.find((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))
  return match?.label ?? 'HRNAVINOS ERP'
}

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const pageTitle = useCurrentPageTitle()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {initials(user?.first_name, user?.last_name)}
          </span>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{`${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim()}</p>
            <p className="text-xs text-slate-500">{user?.role}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={handleLogout}>
          <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Logout
        </Button>
      </div>
    </header>
  )
}
