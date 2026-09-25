import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { getVisibleNavItems } from '@/constants/navigation'

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'

// Whether the rail is collapsed is a preference about the workspace, not about
// the page, so it outlives a reload rather than resetting on every navigation.
// Read lazily so the first paint is already in the right state - initialising
// to false and correcting in an effect would flash the wide sidebar.
function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function DashboardLayout() {
  const { user, hasPermission } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
    } catch {
      // Private browsing or a full quota - the preference just won't persist.
    }
  }, [sidebarCollapsed])

  // A sidebar is for choosing between destinations. A role scoped to a single
  // board has one, and the rail would spend 256px to say nothing, so it isn't
  // rendered. A Section Admin used to be hidden from it outright; now that they
  // have Form Collection as well as their board, they get it like anyone else.
  //
  // Counted from the same list the sidebar would render, rather than from a
  // list of role names: a role that gains a second page gets its navigation
  // back without anybody remembering to come here.
  const destinations = getVisibleNavItems({ user, hasPermission }).reduce(
    (count, item) => count + (item.children ? item.children.length : 1),
    0,
  )
  const hideSidebar = destinations <= 1

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => !collapsed)
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {!hideSidebar && <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Opening and closing the sidebar both happen in its own brand row. */}
        <Topbar showBrand={hideSidebar} />
        {/* Tighter padding on a phone: 24px on each side of a 360px screen is
            13% of the width spent on margin. The extra bottom padding is the
            height of the fixed tab bar, which would otherwise sit on top of
            the last row of whatever page you're on - so it is released at md,
            where the bar itself disappears, not at sm. Sides and top are set
            separately rather than with the p-6 shorthand, which would reset
            the bottom padding at sm while the bar is still on screen. */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Navigation moves to the bottom of the screen on a phone, where a
          thumb reaches. It owns its own overflow sheet, so there is no drawer
          state for this layout to hold. */}
      {!hideSidebar && <BottomNav />}
    </div>
  )
}
