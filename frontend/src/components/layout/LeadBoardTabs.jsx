import { useLocation } from 'react-router-dom'
import { LEAD_BOARDS, useLeadBoard } from '@/hooks/useLeadBoard'

// The Induction / Foundation switch, rendered in the Topbar beside the page
// title. Shown only on the Lead Dashboard itself - `/leads` exactly, since
// `/leads/form-collection` is a different page that happens to share the
// prefix - so the header stays a plain title everywhere else.
//
// No role check: this only appears on a page already gated by LEADS_VIEW, so
// anyone who can see it is someone who can use it.
export function LeadBoardTabs() {
  const { pathname } = useLocation()
  const [board, setBoard] = useLeadBoard()

  if (pathname !== '/leads') return null

  return (
    <div className="inline-flex gap-6">
      {LEAD_BOARDS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setBoard(tab.key)}
          aria-pressed={board === tab.key}
          className={`border-b-2 pb-0.5 text-sm font-semibold transition-colors ${
            board === tab.key ? tab.active : tab.idle
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
