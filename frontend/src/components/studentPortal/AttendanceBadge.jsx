import { CirclePlay, UserCheck, Video } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

// One student at one class, as the portal resolves it: the staff override if
// there is one, else the live call, else the recording. `attended` null is a
// class that hasn't happened yet.
export function AttendanceBadge({ attended, via }) {
  if (attended === null || attended === undefined) {
    return (
      <Badge tone="slate" outline>
        Upcoming
      </Badge>
    )
  }
  if (!attended) {
    return <Badge tone="red">{via === 'manual' ? 'Absent · marked' : 'Absent'}</Badge>
  }
  if (via === 'live') {
    return (
      <Badge tone="green">
        <Video className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
        Live
      </Badge>
    )
  }
  if (via === 'recording') {
    return (
      <Badge tone="blue">
        <CirclePlay className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
        Recording
      </Badge>
    )
  }
  return (
    <Badge tone="violet">
      <UserCheck className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
      Present · marked
    </Badge>
  )
}

// 80% is the line the certificate will be drawn at, so it is the line the
// colour changes at too: green is "on track for the certificate".
export function PercentBadge({ percent }) {
  if (percent === null || percent === undefined) return <span className="text-slate-400">—</span>
  const tone = percent >= 80 ? 'green' : percent >= 60 ? 'amber' : 'red'
  return <Badge tone={tone}>{`${percent}%`}</Badge>
}
