import { useSearchParams } from 'react-router-dom'

// Which board the Lead Dashboard is showing. Lives in the URL rather than in
// component state so the Topbar can own the switch while LeadsPage renders the
// board - and so a board is linkable and survives a refresh.
//
// Kept out of the component file so that one only exports a component; mixing
// the two breaks React Fast Refresh for it.
// Rendered by the shared components/ui/TabStrip, which supplies the track and
// the idle state. Each board only overrides `active`, because Foundation
// carries violet where the default raised pill is brand.
export const LEAD_BOARDS = [
  { key: 'induction', label: 'Induction', active: 'bg-white text-brand-700 shadow-sm' },
  { key: 'foundation', label: 'Foundation', active: 'bg-white text-violet-700 shadow-sm' },
]

export const DEFAULT_LEAD_BOARD = 'induction'

export function useLeadBoard() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('board')
  // Falls back rather than trusting the query string: ?board=nonsense would
  // otherwise render neither board.
  const board = LEAD_BOARDS.some((tab) => tab.key === requested) ? requested : DEFAULT_LEAD_BOARD

  const setBoard = (next) => {
    const updated = new URLSearchParams(params)
    updated.set('board', next)
    // replace: switching tabs shouldn't stack history entries you have to
    // click Back through.
    setParams(updated, { replace: true })
  }

  return [board, setBoard]
}
