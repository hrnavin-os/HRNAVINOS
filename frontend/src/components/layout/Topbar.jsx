import { useLocation, useNavigate } from 'react-router-dom'
import { GraduationCap, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { NAV_LEAF_ITEMS } from '@/constants/navigation'
import { LeadBoardTabs } from '@/components/layout/LeadBoardTabs'
import { NotificationBell } from '@/components/layout/NotificationBell'

// Longest matching path wins: "/leads/form-collection" also starts with
// "/leads", so a plain find() would title the Form Collection page "Lead
// Dashboard" purely because that entry is listed first.
function useCurrentPageTitle() {
  const { pathname } = useLocation()
  const match = NAV_LEAF_ITEMS.filter((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return match?.label ?? 'HRNAVINOS ERP'
}

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

export function Topbar({ showBrand = false }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const pageTitle = useCurrentPageTitle()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="relative flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">
        {/* The logo normally lives at the top of the sidebar, so it moves here
            when there isn't one - otherwise the app loses its name entirely
            for a Section Admin. */}
        {showBrand && (
          <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <GraduationCap className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="hidden sm:block">
              <span className="text-base font-bold leading-none text-slate-900">HRNAVINOS</span>
              <span className="ml-1 text-base font-light leading-none text-slate-400">ERP</span>
            </span>
          </div>
        )}
        <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
      </div>

      {/* Absolutely centred rather than a middle flex column: the title and
          the user block are different widths, so a flex child would sit
          off-centre by the difference. Renders itself only on the Lead
          Dashboard, so the header is a plain title everywhere else.
          pointer-events-none on the wrapper keeps the transparent strip from
          swallowing clicks meant for the header behind it. */}
      <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 md:block">
        <div className="pointer-events-auto">
          <LeadBoardTabs />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
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
