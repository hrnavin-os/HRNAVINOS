import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, GraduationCap, X } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

const LINK_BASE = `group flex items-center gap-3 rounded-md border-l-2 py-2 text-sm font-medium transition-colors`
const LINK_ACTIVE = 'border-blue-600 bg-blue-50 text-blue-700'
const LINK_IDLE = 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'

function NavItemLink({ item, nested = false }) {
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        `${LINK_BASE} ${nested ? 'pl-8 pr-2.5' : 'px-2.5'} ${isActive ? LINK_ACTIVE : LINK_IDLE}`
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
  )
}

// A parent entry that owns no route of its own - clicking it expands the
// children rather than navigating.
function NavGroup({ item }) {
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

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className={`${LINK_BASE} w-full px-2.5 ${showAsActive ? LINK_ACTIVE : LINK_IDLE}`}
      >
        <item.icon
          className={`h-[18px] w-[18px] shrink-0 ${showAsActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`}
          strokeWidth={2}
          aria-hidden="true"
        />
        {item.label}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavItemLink key={child.to} item={child} nested />
          ))}
        </div>
      )}
    </div>
  )
}

function Brand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
        <GraduationCap className="h-5 w-5" strokeWidth={2} />
      </span>
      <span>
        <span className="text-base font-bold leading-none text-slate-900">HRNAVINOS</span>
        <span className="ml-1 text-base font-light leading-none text-slate-400">ERP</span>
      </span>
    </div>
  )
}

// The link list itself, shared by the docked desktop sidebar and the mobile
// drawer so the two can't drift into offering different navigation.
function SidebarNav({ onNavigate }) {
  const { user, hasPermission } = useAuth()
  const items = getVisibleNavItems({ user, hasPermission })

  return (
    <nav onClick={onNavigate} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => (
        <div key={item.to ?? item.label}>
          {item.group && (
            <h3 className="mb-1.5 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">
              {item.group}
            </h3>
          )}
          {item.children ? <NavGroup item={item} /> : <NavItemLink item={item} />}
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
      <Brand />
      <SidebarNav />
    </aside>
  )
}

// The same navigation as a slide-over, for widths where the docked sidebar is
// hidden. Without it the app had no menu at all on a phone: the sidebar was
// `hidden md:flex` and nothing took its place, so every page below md was
// reachable only by typing the URL.
export function MobileSidebar({ isOpen, onClose }) {
  // Escape closes it, and the body is locked so the page underneath doesn't
  // scroll behind the drawer.
  useEffect(() => {
    if (!isOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pr-2">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {/* Any link click closes the drawer - on a phone it covers the page
            you just navigated to, so leaving it open hides the result. */}
        <SidebarNav onNavigate={onClose} />
      </aside>
    </div>
  )
}
