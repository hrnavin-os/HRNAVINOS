import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, GraduationCap, PanelLeftClose } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

// Rows are a comfortable 36px target with a soft rounded tint on hover. The
// active row is marked by a slim brand bar on the rail's edge plus a light
// brand wash - one quiet signal, rather than the left border every row used
// to carry (transparent on all but one) that read as a list of form fields.
const LINK_BASE =
  'group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/40'
const LINK_ACTIVE = 'bg-brand-50 text-brand-700'
const LINK_IDLE = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'

const ICON_BASE = 'h-[18px] w-[18px] shrink-0 transition-colors'
const ICON_ACTIVE = 'text-brand-600'
const ICON_IDLE = 'text-slate-400 group-hover:text-slate-600'

// The bar sits out at the rail's edge, in the nav's own padding, so it marks
// the row without eating into it. `edge` is that padding, which differs
// between the full sidebar and the icon rail.
function ActiveBar({ edge }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1.5 bottom-1.5 w-0.75 rounded-r-full bg-brand-600 ${edge}`}
    />
  )
}

function NavItemLink({ item, nested = false, collapsed = false }) {
  return (
    <NavLink
      to={item.to}
      end
      // Collapsed, the label is gone and the icon carries the row, so it is
      // centred in the rail; the native tooltip stands in for the text.
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `${LINK_BASE} ${collapsed ? 'justify-center px-0' : nested ? 'pl-3 pr-3' : 'px-3'} ${
          isActive ? LINK_ACTIVE : LINK_IDLE
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* A nested row sits inside the group's guide line, which already
              says where it belongs - its bar would land on that line. */}
          {isActive && !nested && <ActiveBar edge={collapsed ? '-left-2' : '-left-3'} />}
          <item.icon
            className={`${ICON_BASE} ${isActive ? ICON_ACTIVE : ICON_IDLE}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
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
  const showAsActive = hasActiveChild && (!isOpen || collapsed)

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
        className={`${LINK_BASE} w-full ${collapsed ? 'justify-center px-0' : 'px-3'} ${
          showAsActive ? LINK_ACTIVE : LINK_IDLE
        }`}
      >
        {showAsActive && <ActiveBar edge={collapsed ? '-left-2' : '-left-3'} />}
        <item.icon
          className={`${ICON_BASE} ${showAsActive ? ICON_ACTIVE : ICON_IDLE}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {collapsed ? (
          <span className="sr-only">{item.label}</span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
              strokeWidth={2}
              aria-hidden="true"
            />
          </>
        )}
      </button>
      {/* Children hang off a guide line from the parent's icon, so the tree
          reads at a glance instead of by indentation alone. */}
      {isOpen && !collapsed && (
        <div className="mt-1 ml-5.25 space-y-0.5 border-l border-slate-200 pl-2.5">
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
    <div className={`flex h-14 shrink-0 items-center border-b border-slate-200 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-md ring-1 shadow-brand-600/25 ring-white/20 ring-inset">
        <GraduationCap className="h-5 w-5" strokeWidth={2} />
      </span>
      {!collapsed && (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-tight text-slate-900">HRNAVINOS</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-slate-500">
              ERP
            </span>
          </div>
          {/* Only the close half lives here - once the rail is 64px wide the
              brand row has no room for it, and the header button reopens it. */}
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
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
    <nav className={`table-scroll flex-1 space-y-0.5 overflow-y-auto pt-4 pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
      {items.map((item, index) => (
        <div key={item.to ?? item.label}>
          {item.group &&
            (collapsed ? (
              // The heading text doesn't fit, but the break between sections
              // still carries meaning - a rule keeps the grouping visible.
              // Not above the first group: there is nothing to divide it from.
              index > 0 && <hr className="mx-2 my-3 border-slate-200" aria-hidden="true" />
            ) : (
              <h3 className="mt-6 mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.08em] text-slate-400 uppercase first:mt-0">
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
      className={`hidden shrink-0 border-r border-slate-200/80 bg-white transition-[width] duration-200 md:flex md:flex-col ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <SidebarNav collapsed={collapsed} onExpandSidebar={() => collapsed && onToggle?.()} />
    </aside>
  )
}
