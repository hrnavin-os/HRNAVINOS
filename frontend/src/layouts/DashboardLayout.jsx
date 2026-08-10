import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'

export function DashboardLayout() {
  const { user } = useAuth()
  // A Section Admin has exactly two destinations - their board, which is where
  // they land, and Notifications, which the header bell opens - so a sidebar
  // listing them spends 256px to say nothing. Everyone else keeps it.
  const hideSidebar = Boolean(user?.scoped_section)

  return (
    <div className="flex h-screen bg-slate-50">
      {!hideSidebar && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar showBrand={hideSidebar} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
