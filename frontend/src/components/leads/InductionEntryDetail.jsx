import {
  Briefcase,
  Calendar,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  Tag,
  UserRound,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MEDIA_BASE_URL } from '@/constants/config'
import { formatDate } from '@/utils/formatters'

// Extracted from InductionLeadsBoard so the Foundation board can render it
// too: once a lead is matched to an induction entry, its detail popup shows
// the same induction record rather than a second, divergent rendering of it.

// Same treatment as the Programs detail popup: accent on the icon plate, text
// in slate tokens. A light hue is hard to read as text, and identity already
// comes from the coloured plate beside it.
const DETAIL_TONES = {
  blue: 'bg-linear-to-br from-blue-500 to-blue-700',
  violet: 'bg-linear-to-br from-violet-500 to-violet-700',
  emerald: 'bg-linear-to-br from-emerald-500 to-emerald-700',
  amber: 'bg-linear-to-br from-amber-500 to-amber-700',
  rose: 'bg-linear-to-br from-rose-500 to-rose-700',
  cyan: 'bg-linear-to-br from-cyan-500 to-cyan-700',
}

const SECTION_EDGE = {
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
}

// null stays null so an unanswered yes/no is skipped rather than shown as "No".
const yesNo = (value) => (value === true ? 'Yes' : value === false ? 'No' : null)

// Compact on purpose: eight of these stacked in a modal, at card size with
// full padding and a border each, pushed the collected details below the fold.
// A plate, a label and a value is all the information they carry.
function DetailTile({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${DETAIL_TONES[tone]}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-900" title={value || undefined}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

function DetailSection({ title, icon: Icon, tone, entries, children }) {
  const filled = entries.filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (filled.length === 0 && !children) return null

  return (
    // Left edge rather than a full tint: four stacked panels each washed a
    // different colour turned the popup into a paint chart. The edge and the
    // plate carry the section's identity; the surface stays white.
    <div className={`overflow-hidden rounded-lg border border-slate-200 border-l-4 bg-white ${SECTION_EDGE[tone]}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3.5 py-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${DETAIL_TONES[tone]}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
      </div>
      <div className="px-3.5 py-3">
        {filled.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {filled.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="break-words text-sm text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </div>
  )
}

export function InductionEntryDetail({ entry, hideAssignee = false }) {
  return (
    <div className="space-y-4">
      {/* Batch leads: it's the derived value everything else is filed under,
          and the first thing you check on an entry. */}
      <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700/70">Batch</p>
            <p className="mt-0.5 text-lg font-semibold text-brand-700">{entry.batch}</p>
          </div>
          {hideAssignee ? null : entry.assigned_to_name ? (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700/70">Assigned to</p>
              <p className="mt-0.5 flex items-center justify-end gap-1.5 text-sm font-semibold text-slate-900">
                {entry.assigned_to_name}
                {entry.section && <Badge tone="violet">{entry.section.toUpperCase()}</Badge>}
              </p>
            </div>
          ) : (
            <Badge tone="amber">Unassigned</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DetailTile icon={Phone} label="Phone Number" value={entry.phone} tone="blue" />
        <DetailTile icon={Mail} label="Email" value={entry.email} tone="violet" />
        <DetailTile icon={Calendar} label="Registration Date" value={formatDate(entry.registration_date)} tone="rose" />
        <DetailTile
          icon={Wallet}
          label="Paid Date"
          value={entry.paid_date ? formatDate(entry.paid_date) : null}
          tone="emerald"
        />
        <DetailTile icon={UserRound} label="Sales Person" value={entry.sales_person} tone="cyan" />
        <DetailTile icon={Megaphone} label="Lead Source" value={entry.lead_source} tone="amber" />
        <DetailTile icon={CreditCard} label="Payment Mode" value={entry.payment_mode} tone="violet" />
        <DetailTile icon={Tag} label="Category" value={entry.category} tone="emerald" />
      </div>

      {/* The post-call pages. Each section is skipped entirely when empty, so
          an entry nobody has worked yet reads as short rather than as a wall
          of dashes. */}
      <DetailSection title="Qualification" icon={GraduationCap} tone="blue" entries={[
        ['UG Degree', entry.qualification?.ug_degree],
        ['UG Passed Out', entry.qualification?.ug_passed_out_year],
        ['PG Degree', entry.qualification?.pg_degree],
        ['PG Passed Out', entry.qualification?.pg_passed_out_year],
      ]} />

      <DetailSection title="Placement" icon={Briefcase} tone="emerald" entries={[
        ['Work Experience', entry.placement?.work_experience],
        ['Training / Extra Course', entry.placement?.training_or_extra_course],
        ['Current Location', entry.placement?.current_location],
        ['Preferred Location', entry.placement?.preferred_location],
      ]} />

      <DetailSection title="Remarks" icon={MessageSquare} tone="violet" entries={[
        ['Session', entry.remarks?.session_preference],
        ['Requirements', entry.remarks?.requirements],
        ['Details', entry.remarks?.details],
        ['Doubts Clarified', entry.remarks?.doubts_clarified],
      ]} />

      <DetailSection
        title="Other Details"
        icon={ClipboardList}
        tone="amber"
        entries={[
          ['Induction Call Date', entry.other_details?.induction_call_date ? formatDate(entry.other_details.induction_call_date) : null],
          ['Scheduled Time', entry.other_details?.scheduled_time],
          ['Terms Form Signed', yesNo(entry.other_details?.terms_form_signed)],
          ['WhatsApp Group Added', yesNo(entry.other_details?.whatsapp_group_added)],
          ['Confidence', entry.other_details?.confidence],
        ]}
      >
        {/* Played inline rather than linked out: the recording is the point of
            opening this section, and a link meant leaving the popup to watch
            it. Falls back to a download link if the browser can't play the
            container. */}
        {entry.other_details?.call_recording_url && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Call Recording</p>
            <video
              controls
              preload="metadata"
              className="max-h-64 w-full rounded-md border border-slate-200 bg-slate-900"
              src={`${MEDIA_BASE_URL}${entry.other_details.call_recording_url}`}
            >
              <a href={`${MEDIA_BASE_URL}${entry.other_details.call_recording_url}`}>Download the recording</a>
            </video>
          </div>
        )}
      </DetailSection>
    </div>
  )
}
