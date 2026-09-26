import { CalendarDays, Mail, Phone, Video, Zap } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { FoundationGroupBadge } from '@/components/leads/FoundationGroupBadge'
import { formatDate, formatDateTime, formatMinutes } from '@/utils/formatters'

// Where one marker's answer came from, in words: the details the table leaves
// out to stay narrow.
function markSource(mark) {
  if (!mark || mark.source === 'none') return <span className="text-slate-400">Not marked yet</span>
  if (mark.source === 'auto') {
    return (
      <span className="inline-flex items-center gap-1">
        <Zap className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden="true" />
        Automatic — from their Foundation Form
      </span>
    )
  }
  if (mark.source === 'meet') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <Video className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden="true" />
        Google Meet · {formatMinutes(mark.meet_duration_seconds)}
        {mark.meet_joined_at && (
          <span className="text-slate-400">
            ({formatDateTime(mark.meet_joined_at)} – {formatDateTime(mark.meet_left_at)})
          </span>
        )}
      </span>
    )
  }
  return (
    <span>
      {mark.by_name ? `By ${mark.by_name}` : 'Marked by hand'}
      {mark.at && <span className="text-slate-400"> · {formatDateTime(mark.at)}</span>}
    </span>
  )
}

/**
 * One student on the attendance roll, opened from their row: who they are,
 * where they stand on all four markers - with who marked each and when, or
 * where an automatic answer came from - and the poll follow-up calls.
 *
 * `tabs` is the board's marker list, so the labels and yes/no words match the
 * pages; `current` is the marker whose page it was opened from.
 */
export function StudentAttendanceModal({ student, tabs, current, onClose }) {
  const followUps = student.poll_follow_ups ?? []

  return (
    <Modal title={student.name} isOpen onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden="true" />
            {student.phone}
          </span>
          {student.email && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
              <span className="truncate">{student.email}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden="true" />
            Registered {formatDate(student.registration_date)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {student.section && <Badge tone="blue">{student.section.toUpperCase()} Section</Badge>}
          {student.batch && <Badge tone="slate">{student.batch}</Badge>}
          <FoundationGroupBadge group={student.foundation_group} history={student.foundation_group_history} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance</p>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {tabs.map((tab) => {
              const mark = student.marks?.[tab.key]
              const Icon = tab.icon
              return (
                <li
                  key={tab.key}
                  className={`flex items-start gap-3 px-3 py-2.5 ${tab.key === current ? 'bg-brand-50/50' : ''}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{tab.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{markSource(mark)}</p>
                  </div>
                  <Badge tone={mark?.marked ? 'emerald' : 'amber'}>{mark?.marked ? tab.yes : tab.no}</Badge>
                </li>
              )
            })}
          </ul>
        </div>

        {followUps.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Poll follow-ups ({followUps.length})
            </p>
            <ul className="space-y-2">
              {followUps.map((item, index) => (
                <li key={index} className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{item.remark}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDateTime(item.at)}
                    {item.by_name ? ` · ${item.by_name}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
