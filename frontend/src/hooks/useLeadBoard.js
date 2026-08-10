import { useSearchParams } from 'react-router-dom'

// Which board the Lead Dashboard is showing. Lives in the URL rather than in
// component state so the Topbar can own the switch while LeadsPage renders the
// board - and so a board is linkable and survives a refresh.
//
// Kept out of the component file so that one only exports a component; mixing
// the two breaks React Fast Refresh for it.
export const LEAD_BOARDS = [
  {
    key: 'induction',
    label: 'Induction',
    active: 'bg-brand-600 text-white shadow-sm',
    idle: 'text-brand-700 hover:bg-brand-50',
  },
  {
    key: 'foundation',
    label: 'Foundation',
    active: 'bg-violet-600 text-white shadow-sm',
    idle: 'text-violet-700 hover:bg-violet-50',
  },
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
