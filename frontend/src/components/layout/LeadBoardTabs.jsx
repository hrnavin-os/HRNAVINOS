import { useLocation } from 'react-router-dom'
import { TabStrip } from '@/components/ui/TabStrip'
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

  // Each board's `active` classes ride along on the tab, so Foundation keeps
  // its violet while the strip itself stays the shared one.
  const tabs = <TabStrip tabs={LEAD_BOARDS} value={board} onChange={setBoard} />

  if (!bar) return tabs

  return <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">{tabs}</div>
}
