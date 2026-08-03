import { NavLink } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { NAV_ITEMS } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

export function Sidebar() {
  const { user, hasPermission } = useAuth()
  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.permission || hasPermission(item.permission)) &&
      !item.hiddenForRoles?.includes(user?.role) &&
      !(item.hiddenForScopedUsers && user?.scoped_section),
  )

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <GraduationCap className="h-5 w-5" strokeWidth={2} />
        </span>
        <span>
          <span className="text-base font-bold leading-none text-slate-900">HRNAVINOS</span>
          <span className="ml-1 text-base font-light leading-none text-slate-400">ERP</span>
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <div key={item.to}>
            {item.group && (
              <h3 className="mb-1.5 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">
                {item.group}
              </h3>
            )}
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-md border-l-2 px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
    </aside>
  )
}
