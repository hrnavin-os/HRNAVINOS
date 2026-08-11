import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { getVisibleNavItems } from '@/constants/navigation'
import { useAuth } from '@/hooks/useAuth'

// How many destinations get their own tab. Five slots on a 360px screen is
// about 70px each, which is the width an icon over a one-word label needs
// before the label starts truncating.
const SLOTS = 5

const TAB_BASE =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors'

// The phone equivalent of the sidebar: the destinations this user can reach,
// pinned within thumb reach instead of behind a hamburger at the top of the
// screen.
//
// Items come from the same getVisibleNavItems the sidebar uses, flattened, so
// the bar can never offer a page the sidebar wouldn't - or one the role has no
// permission for. Anything past the first few slots goes to More, which opens
// the existing drawer.
export function BottomNav({ onMore }) {
  const { user, hasPermission } = useAuth()
  const leaves = getVisibleNavItems({ user, hasPermission }).flatMap((item) => item.children ?? [item])

  if (leaves.length === 0) return null

  // No point spending a slot on More for a single leftover item - if
  // everything fits, everything gets a tab.
  const fits = leaves.length <= SLOTS
  const primary = fits ? leaves : leaves.slice(0, SLOTS - 1)
  const overflow = fits ? [] : leaves.slice(SLOTS - 1)

  return (
    // pb-[env(safe-area-inset-bottom)] keeps the tabs clear of the home
    // indicator on an iPhone, where the bottom of the viewport is not the
    // bottom of the usable screen.
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] md:hidden">
      <div className="flex items-stretch">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `${TAB_BASE} ${isActive ? 'text-brand-600' : 'text-slate-500'}`
            }
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
                  <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="w-full truncate text-center">{item.shortLabel ?? item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {overflow.length > 0 && (
          <button type="button" onClick={onMore} className={`${TAB_BASE} text-slate-500`} aria-label="More pages">
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <MoreHorizontal className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="w-full truncate text-center">More</span>
          </button>
        )}
      </div>
    </nav>
  )
}
