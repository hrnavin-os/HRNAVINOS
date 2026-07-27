import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { ROLES_WITHOUT_SIDEBAR } from '@/constants/layout'

export function DashboardLayout() {
  const { user } = useAuth()
  const showSidebar = !ROLES_WITHOUT_SIDEBAR.includes(user?.role)

  return (
    <div className="flex h-screen bg-slate-50">
      {showSidebar && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
