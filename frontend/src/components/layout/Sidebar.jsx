import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, GraduationCap, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

// The sidebar is a solid band of the theme gradient, so everything on it is
// light. Rows are a comfortable 36px target with a soft white tint on hover;
// the active row is a white pill carrying the brand colour back - the one
// solid-white thing on the rail, so where you are is never in doubt.
const LINK_BASE =
  'group relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60'
const LINK_ACTIVE = 'bg-white text-brand-700 shadow-sm shadow-brand-900/20'
const LINK_IDLE = 'text-white/85 hover:bg-white/10 hover:text-white'

const ICON_BASE = 'h-4.5 w-4.5 shrink-0 transition-colors'
const ICON_ACTIVE = 'text-brand-600'
const ICON_IDLE = 'text-white/70 group-hover:text-white'

// The bar sits out at the rail's edge, in the nav's own padding, so it marks
// the row without eating into it. `edge` is that padding, which differs
// between the full sidebar and the icon rail.
function ActiveBar({ edge }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute top-1.5 bottom-1.5 w-0.75 rounded-r-full bg-white ${edge}`}
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
              className={`ml-auto h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 ${
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
        <div className="mt-1 ml-5.25 space-y-0.5 border-l border-white/20 pl-2.5">
          {item.children.map((child) => (
            <NavItemLink key={child.to} item={child} nested />
          ))}
        </div>
      )}
    </div>
  )
}

// White on the gradient: the one tile that stays solid, so the mark reads
// as the logo rather than as another row icon.
const LOGO_MARK =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-md shadow-brand-900/25'

function Brand({ collapsed, onToggle }) {
  // Both halves of the toggle live in this row, so opening and closing happen
  // in the same place. Collapsed, the 64px rail has room for one square, so
  // the logo itself is the expand button - it turns into the panel icon on
  // hover, the way the close button looks when the sidebar is open.
  if (collapsed) {
    return (
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-white/10 px-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="group/expand relative flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <span className={`${LOGO_MARK} transition-opacity group-hover/expand:opacity-0 group-focus-visible/expand:opacity-0`}>
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </span>
          <PanelLeftOpen
            className="absolute h-4.5 w-4.5 text-white opacity-0 transition-opacity group-hover/expand:opacity-100 group-focus-visible/expand:opacity-100"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
      <span className={LOGO_MARK}>
        <GraduationCap className="h-5 w-5" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-[15px] font-bold tracking-tight text-white">HRNAVINOS</span>
        <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white">
          ERP
        </span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
        className="ml-auto -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <PanelLeftClose className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}

// The link list itself, shared by the docked desktop sidebar and the mobile
// drawer so the two can't drift into offering different navigation.
function SidebarNav({ collapsed, onExpandSidebar }) {
  const { user, hasPermission } = useAuth()
  const items = getVisibleNavItems({ user, hasPermission })

  return (
    <nav className={`sidebar-scroll flex-1 space-y-0.5 overflow-y-auto pt-4 pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
      {items.map((item, index) => (
        <div key={item.to ?? item.label}>
          {item.group &&
            (collapsed ? (
              // The heading text doesn't fit, but the break between sections
              // still carries meaning - a rule keeps the grouping visible.
              // Not above the first group: there is nothing to divide it from.
              index > 0 && <hr className="mx-2 my-3 border-white/15" aria-hidden="true" />
            ) : (
              <h3 className="mt-6 mb-1.5 px-3 text-[10.5px] font-semibold tracking-[0.08em] text-brand-100/80 uppercase first:mt-0">
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
      // The theme gradient, top to bottom: lightest behind the logo, deepening
      // down the rail so the long list of rows sits on the darkest, most
      // readable part of it.
      className={`hidden shrink-0 bg-linear-to-b from-brand-600 via-brand-700 to-brand-900 transition-[width] duration-200 md:flex md:flex-col ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <Brand collapsed={collapsed} onToggle={onToggle} />
      <SidebarNav collapsed={collapsed} onExpandSidebar={() => collapsed && onToggle?.()} />
    </aside>
  )
}
