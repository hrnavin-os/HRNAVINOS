import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { MobileSidebar, Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'

export function DashboardLayout() {
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // A Section Admin has exactly two destinations - their board, which is where
  // they land, and Notifications, which the header bell opens - so a sidebar
  // listing them spends 256px to say nothing. Everyone else keeps it.
  const hideSidebar = Boolean(user?.scoped_section)

  return (
    <div className="flex h-screen bg-slate-50">
      {!hideSidebar && <Sidebar />}
      {!hideSidebar && <MobileSidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          showBrand={hideSidebar}
          onMenuClick={hideSidebar ? undefined : () => setIsMenuOpen(true)}
        />
        {/* Tighter padding on a phone: 24px on each side of a 360px screen is
            13% of the width spent on margin. */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
