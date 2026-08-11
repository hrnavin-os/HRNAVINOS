import { useLocation } from 'react-router-dom'
import { LEAD_BOARDS, useLeadBoard } from '@/hooks/useLeadBoard'

// The Induction / Foundation switch, rendered in the Topbar beside the page
// title. Shown only on the Lead Dashboard itself - `/leads` exactly, since
// `/leads/form-collection` is a different page that happens to share the
// prefix - so the header stays a plain title everywhere else.
//
// No role check: this only appears on a page already gated by LEADS_VIEW, so
// anyone who can see it is someone who can use it.
// `bar` renders the switch as its own full-width row, which is how it appears
// below md where the header has no room to centre anything. The wrapper lives
// here rather than in the Topbar so the "only on /leads" rule stays in one
// place - outside it the whole row disappears instead of leaving an empty
// bordered strip under the header on every other page.
export function LeadBoardTabs({ bar = false }) {
  const { pathname } = useLocation()
  const [board, setBoard] = useLeadBoard()

  if (pathname !== '/leads') return null

  const tabs = (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {LEAD_BOARDS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setBoard(tab.key)}
          aria-pressed={board === tab.key}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
            board === tab.key ? tab.active : tab.idle
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  if (!bar) return tabs

  return <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">{tabs}</div>
}
