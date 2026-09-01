import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/layout/BottomNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'
import { getVisibleNavItems } from '@/constants/navigation'

export function DashboardLayout() {
  const { user, hasPermission } = useAuth()
  // A sidebar is for choosing between destinations. A Section Admin has two -
  // their board, which is where they land, and Notifications, which the header
  // bell opens - and a role scoped to a single board has one. Either way the
  // rail spends 256px to say nothing, so it isn't rendered.
  //
  // Counted from the same list the sidebar would render, rather than from a
  // list of role names: a role that gains a second page gets its navigation
  // back without anybody remembering to come here.
  const destinations = getVisibleNavItems({ user, hasPermission }).reduce(
    (count, item) => count + (item.children ? item.children.length : 1),
    0,
  )
  const hideSidebar = Boolean(user?.scoped_section) || destinations <= 1

  return (
    <div className="flex h-screen bg-slate-50">
      {!hideSidebar && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
