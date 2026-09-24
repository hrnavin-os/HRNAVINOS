import { Badge } from '@/components/ui/Badge'
import { foundationGroupLabel, foundationGroupTone } from '@/constants/foundationGroups'

// Which foundation class a row is in.
//
// One component rather than the same badge written out on each of the boards
// that show it (Foundation, Attendance, Batch Confirmation, HR): the group
// means the same thing on all of them, and a colour that meant Group 1 on one
// board and Group 2 on another would be worse than no colour at all.
//
// Read-only. The boards where the group is editable use FoundationGroupCell.
export function FoundationGroupBadge({ group }) {
  if (!group) return <span className="text-slate-400">—</span>
  return <Badge tone={foundationGroupTone(group)}>{foundationGroupLabel(group)}</Badge>
}
