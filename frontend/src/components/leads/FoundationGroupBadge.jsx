import { Badge } from '@/components/ui/Badge'
import {
  foundationGroupLabel,
  foundationGroupTone,
  lastGroupMove,
} from '@/constants/foundationGroups'
import { formatDateTime } from '@/utils/formatters'

// Which foundation class a row is in, and whether it was moved there.
//
// One component rather than the same badge written out on each of the boards
// that show it (Foundation, Attendance, Batch Confirmation, HR): the group
// means the same thing on all of them, and a colour that meant Group 1 on one
// board and Group 2 on another would be worse than no colour at all.
//
// Read-only. The boards where the group is editable use FoundationGroupCell,
// which renders this underneath its dropdown.
export function FoundationGroupBadge({ group, history }) {
  const moved = lastGroupMove(history)
  if (!group && !moved) return <span className="text-slate-400">—</span>

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      {group ? (
        <Badge tone={foundationGroupTone(group)}>{foundationGroupLabel(group)}</Badge>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      {/* A student moved mid-course is the one thing about this column that
          can't be read off the badge - a roll printed before the move is
          wrong, and the only way anyone finds out is if the row says so.
          Small and grey: it is a footnote on the group, not a second value,
          and every row carrying one at the badge's weight would drown the
          column it annotates. */}
      {moved && (
        <span
          className="text-[11px] leading-tight text-amber-600"
          title={`Moved by ${moved.by_name ?? 'someone'} on ${formatDateTime(moved.at)}`}
        >
          moved from {foundationGroupLabel(moved.from_group)}
        </span>
      )}
    </div>
  )
}
