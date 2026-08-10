import { useSearchParams } from 'react-router-dom'

// Which board the Lead Dashboard is showing. Lives in the URL rather than in
// component state so the Topbar can own the switch while LeadsPage renders the
// board - and so a board is linkable and survives a refresh.
//
// Kept out of the component file so that one only exports a component; mixing
// the two breaks React Fast Refresh for it.
// Each board keeps its own accent, carried by the text and an underline
// rather than a filled pill - the header sits on white and a solid chip in it
// read as a button floating over the page.
export const LEAD_BOARDS = [
  {
    key: 'induction',
    label: 'Induction',
    active: 'border-brand-600 text-brand-600',
    idle: 'border-transparent text-slate-500 hover:text-slate-700',
  },
  {
    key: 'foundation',
    label: 'Foundation',
    active: 'border-violet-600 text-violet-600',
    idle: 'border-transparent text-slate-500 hover:text-slate-700',
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
