import { CheckCircle2, Clock, CircleAlert, CircleDashed } from 'lucide-react'

// The four states of WhatsApp group onboarding. Kept in one place because the
// row pill, the summary cards and the row actions all have to agree on what
// each state is called and what colour it is - three copies of that would
// drift.
//
// `tone` is a StatCard tone name, so the cards above the table are the same
// component the lead boards and the coordinator queues use rather than a
// second kind of summary tile invented for this page. The colours follow the
// brief either way: green joined, amber waiting, red overdue, grey not
// started. Each state also carries an icon, so it survives being read by
// someone who can't separate the amber from the red.
export const WHATSAPP_STATUS = {
  not_invited: {
    value: 'not_invited',
    label: 'Not Invited',
    icon: CircleDashed,
    tone: 'slate',
    pill: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  invite_sent: {
    value: 'invite_sent',
    label: 'Waiting for Join',
    // Shorter, for the card where the label sits on one line.
    cardLabel: 'Invite Sent',
    icon: Clock,
    tone: 'amber',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  joined: {
    value: 'joined',
    label: 'Joined',
    icon: CheckCircle2,
    tone: 'emerald',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  follow_up_required: {
    value: 'follow_up_required',
    label: 'Follow-up Required',
    cardLabel: 'Follow-up',
    icon: CircleAlert,
    tone: 'red',
    pill: 'border-red-200 bg-red-50 text-red-700',
  },
}

// Order the cards read in: the lifecycle, left to right, so the row doubles as
// a diagram of the process.
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
