import { Badge } from '@/components/ui/Badge'
import { foundationGroupLabel, foundationGroupTone } from '@/constants/foundationGroups'

// Which of a batch's two foundation classes a row came through.
//
// One component rather than the same three-line badge written out on each of
// the boards that show it (Foundation, Attendance, Batch Confirmation): the
// group means the same thing on all of them, and a colour that meant Group 1
// on one board and Group 2 on another would be worse than no colour at all.
//
// Renders an em dash for a row with no group - a lead whose date the backend
// couldn't read - rather than a badge saying nothing.
export function FoundationGroupBadge({ group }) {
  if (!group) return <span className="text-slate-400">—</span>
  return <Badge tone={foundationGroupTone(group)}>{foundationGroupLabel(group)}</Badge>
}
