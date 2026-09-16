import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, GraduationCap, PanelLeftClose } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

const LINK_BASE = `group flex items-center gap-2.5 rounded-md border-l-2 py-1.5 text-sm font-medium transition-colors`
const LINK_ACTIVE = 'border-brand-600 bg-brand-50 text-brand-700'
const LINK_IDLE = 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'

function NavItemLink({ item, nested = false, collapsed = false }) {
  return (
    <NavLink
      to={item.to}
      end
      // Collapsed, the label is gone and the icon carries the row, so it is
      // centred in the rail; the native tooltip stands in for the text.
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `${LINK_BASE} ${collapsed ? 'justify-center px-0' : nested ? 'pl-8 pr-2.5' : 'px-2.5'} ${
          isActive ? LINK_ACTIVE : LINK_IDLE
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-500'}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
        </>
      )}
    </NavLink>
  )
}

// A parent entry that owns no route of its own - clicking it expands the
// children rather than navigating.
function NavGroup({ item, collapsed = false, onExpandSidebar }) {
  const { pathname } = useLocation()
  const hasActiveChild = item.children.some(
    (child) => pathname === child.to || pathname.startsWith(`${child.to}/`),
  )
  const [isOpen, setIsOpen] = useState(hasActiveChild)

  // Arriving at a child from somewhere else (a redirect, a link on another
  // page) should reveal it rather than leave it hidden under a collapsed
  // parent. Collapsing by hand still works afterwards.
  useEffect(() => {
    if (hasActiveChild) setIsOpen(true)
  }, [hasActiveChild])

  // Highlight the parent only while it's collapsed - once open, the active
  // child carries the highlight and two would compete.
  const showAsActive = hasActiveChild && !isOpen

  // There is nowhere to put a child list in a 64px rail, so in that state the
  // parent reopens the sidebar instead of expanding in place - the children
  // then appear where they can actually be read.
  function handleClick() {
    if (collapsed) {
      setIsOpen(true)
      onExpandSidebar?.()
      return
    }
    setIsOpen((open) => !open)
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={collapsed ? false : isOpen}
        title={collapsed ? item.label : undefined}
        className={`${LINK_BASE} w-full ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${showAsActive || (collapsed && hasActiveChild) ? LINK_ACTIVE : LINK_IDLE}`}
      >
        <item.icon
          className={`h-[18px] w-[18px] shrink-0 ${showAsActive || (collapsed && hasActiveChild) ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-500'}`}
          strokeWidth={2}
          aria-hidden="true"
        />
        {collapsed ? (
          <span className="sr-only">{item.label}</span>
        ) : (
          <>
            {item.label}
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              strokeWidth={2}
              aria-hidden="true"
            />
          </>
        )}
      </button>
      {isOpen && !collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavItemLink key={child.to} item={child} nested />
          ))}
        </div>
      )}
    </div>
  )
}

function Brand({ collapsed, onToggle }) {
  return (
    <div
      className={`flex h-14 shrink-0 items-center border-b border-slate-200 ${
        collapsed ? 'justify-center px-2' : 'gap-2 px-4'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
        <GraduationCap className="h-5 w-5" strokeWidth={2} />
      </span>
      {!collapsed && (
        <>
          <span>
            <span className="text-[15px] font-semibold leading-none tracking-tight text-slate-900">HRNAVINOS</span>
            <span className="ml-1 text-[15px] font-normal leading-none text-slate-400">ERP</span>
          </span>
          {/* Only the close half lives here - once the rail is 64px wide the
              brand row has no room for it, and the header button reopens it. */}
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}

// The link list itself, shared by the docked desktop sidebar and the mobile
// drawer so the two can't drift into offering different navigation.
function SidebarNav({ collapsed, onExpandSidebar }) {
  const { user, hasPermission } = useAuth()
  const items = getVisibleNavItems({ user, hasPermission })

  return (
    <nav className={`flex-1 space-y-0.5 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-2.5'}`}>
      {items.map((item, index) => (
        <div key={item.to ?? item.label}>
          {item.group &&
            (collapsed ? (
              // The heading text doesn't fit, but the break between sections
              // still carries meaning - a rule keeps the grouping visible.
              // Not above the first group: there is nothing to divide it from.
              index > 0 && <hr className="my-2 border-slate-200" aria-hidden="true" />
            ) : (
              <h3 className="mb-1 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">
                {item.group}
              </h3>
            ))}
          {item.children ? (
            <NavGroup item={item} collapsed={collapsed} onExpandSidebar={onExpandSidebar} />
          ) : (
            <NavItemLink item={item} collapsed={collapsed} />
          )}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({ collapsed = false, onToggle }) {
  return (
    <aside
      className={`hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 md:flex md:flex-col ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <SidebarNav collapsed={collapsed} onExpandSidebar={() => collapsed && onToggle?.()} />
    </aside>
  )
}
