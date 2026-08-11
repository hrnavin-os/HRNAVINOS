import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

// How many destinations get their own tab. Five slots on a 360px screen is
// about 70px each, which is the width an icon over a one-word label needs
// before the label starts truncating.
const SLOTS = 5

const TAB_BASE =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors'

// The overflow, as a sheet rising from the bottom bar that opened it - not a
// drawer flying in from the left edge, which is where the navigation
// deliberately stopped living.
function MoreSheet({ items, isOpen, onClose }) {
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
      <div
        role="dialog"
        aria-label="More pages"
        className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl"
      >
        {/* The grab handle is the convention that says which edge this came
            from and which way it goes back. */}
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <p className="text-sm font-semibold text-slate-900">More</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* A grid rather than a list: these are destinations, not settings, and
            three across puts twice as many within reach without scrolling. */}
        <div className="grid grid-cols-3 gap-2 p-4 pt-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              onClick={onClose}
              className={({ isActive }) =>
                `flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors ${
                  isActive
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="w-full text-[11px] font-medium leading-tight">
                    {item.shortLabel ?? item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}

// The phone equivalent of the sidebar: the destinations this user can reach,
// pinned within thumb reach instead of behind a hamburger at the top of the
// screen.
//
// Items come from the same getVisibleNavItems the sidebar uses, flattened, so
// the bar can never offer a page the sidebar wouldn't - or one the role has no
// permission for. Anything past the first few slots goes to More.
export function BottomNav() {
  const { user, hasPermission } = useAuth()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const leaves = getVisibleNavItems({ user, hasPermission }).flatMap((item) => item.children ?? [item])

  if (leaves.length === 0) return null

  // No point spending a slot on More for a single leftover item - if
  // everything fits, everything gets a tab.
  const fits = leaves.length <= SLOTS
  const primary = fits ? leaves : leaves.slice(0, SLOTS - 1)
  const overflow = fits ? [] : leaves.slice(SLOTS - 1)

  return (
    <>
      {/* pb-[env(safe-area-inset-bottom)] keeps the tabs clear of the home
          indicator on an iPhone, where the bottom of the viewport is not the
          bottom of the usable screen. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] md:hidden">
        <div className="flex items-stretch">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `${TAB_BASE} ${isActive ? 'text-brand-600' : 'text-slate-500'}`}
            >
              {({ isActive }) => (
                <>
                  {/* The active tab gets a tinted plate rather than just a colour
                      change - at 18px an icon shifting hue is easy to miss. */}
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-brand-50' : ''
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="w-full truncate text-center">{item.shortLabel ?? item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              aria-expanded={isMoreOpen}
              className={`${TAB_BASE} ${isMoreOpen ? 'text-brand-600' : 'text-slate-500'}`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  isMoreOpen ? 'bg-brand-50' : ''
                }`}
              >
                <MoreHorizontal className="h-4.5 w-4.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="w-full truncate text-center">More</span>
            </button>
          )}
        </div>
      </nav>

      <MoreSheet items={overflow} isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  )
}
