import { CheckCircle2, Clock, CircleAlert, CircleDashed } from 'lucide-react'

// The four states of WhatsApp group onboarding. Kept in one place because the
// pill, the filter chips and the row actions all have to agree on what each
// state is called and what colour it is - three copies of that would drift.
//
// The dot colours follow the brief: green joined, amber waiting, red overdue,
// grey not started. Each also carries an icon, so the state survives being
// read by someone who can't separate the amber from the red.
export const WHATSAPP_STATUS = {
  not_invited: {
    value: 'not_invited',
    label: 'Not Invited',
    icon: CircleDashed,
    dot: 'bg-slate-300',
    pill: 'border-slate-200 bg-slate-50 text-slate-600',
    chip: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  invite_sent: {
    value: 'invite_sent',
    label: 'Waiting for Join',
    // Shorter, for the filter chip where the column is narrow.
    chipLabel: 'Invite Sent',
    icon: Clock,
    dot: 'bg-amber-400',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
    chip: 'border-amber-300 bg-amber-100 text-amber-800',
  },
  joined: {
    value: 'joined',
    label: 'Joined',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    chip: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  },
  follow_up_required: {
    value: 'follow_up_required',
    label: 'Follow-up Required',
    chipLabel: 'Follow-up',
    icon: CircleAlert,
    dot: 'bg-red-500',
    pill: 'border-red-200 bg-red-50 text-red-700',
    chip: 'border-red-300 bg-red-100 text-red-800',
  },
}

// Order the chips read in: the lifecycle, left to right, so the row of filters
// doubles as a diagram of the process.
export const WHATSAPP_STATUS_ORDER = ['not_invited', 'invite_sent', 'follow_up_required', 'joined']

// What each audit action is called on screen. The backend records
// WHATSAPP_JOINED_MANUAL separately from a hypothetical event-driven join, so
// the history can say which it was.
export const WHATSAPP_ACTION_LABELS = {
  WHATSAPP_INVITE_SENT: 'Invite sent',
  WHATSAPP_INVITE_RESENT: 'Invite resent',
  WHATSAPP_JOINED_MANUAL: 'Marked as joined',
  WHATSAPP_FOLLOW_UP: 'Follow-up performed',
}
