import {
  Briefcase,
  Calendar,
  ClipboardList,
  CreditCard,
  ExternalLink,
  GraduationCap,
  Layers,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  PlayCircle,
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
  blue: 'bg-blue-600',
  violet: 'bg-violet-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
  cyan: 'bg-cyan-600',
  slate: 'bg-slate-600',
}

const SECTION_EDGE = {
  blue: 'border-l-blue-500',
  violet: 'border-l-violet-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  cyan: 'border-l-cyan-500',
  slate: 'border-l-slate-400',
}

// Soft tints for the tile plates, not the saturated gradients the section
// headers use. Eight gradients side by side in one grid competed with each
// other and with the values they were labelling - at that density the colour
// stops being identity and becomes noise. Muted, the icons still separate the
// fields at a glance and the data is what's dark on the tile.
const TILE_TONES = {
  blue: 'bg-blue-100 text-blue-600',
  violet: 'bg-violet-100 text-violet-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  cyan: 'bg-cyan-100 text-cyan-600',
  slate: 'bg-slate-100 text-slate-500',
}

// null stays null so an unanswered yes/no is skipped rather than shown as "No".
const yesNo = (value) => (value === true ? 'Yes' : value === false ? 'No' : null)

// Compact on purpose: eight of these stacked in a modal, at card size with
// full padding and a border each, pushed the collected details below the fold.
// A plate, a label and a value is all the information they carry.
function DetailTile({ icon: Icon, label, value, tone }) {
  // Half these fields are routinely blank, and at full strength a row of "—"
  // read as loudly as the answers. An empty tile recedes so the eye lands on
  // what was actually collected.
  const isEmpty = !value
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
        isEmpty ? 'border-slate-100 bg-slate-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          isEmpty ? TILE_TONES.slate : TILE_TONES[tone]
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p
          className={`truncate text-sm ${isEmpty ? 'text-slate-300' : 'font-semibold text-slate-900'}`}
          title={value || undefined}
        >
          {value || 'Not recorded'}
        </p>
      </div>
    </div>
  )
}

// The one panel shape used by every titled block in a lead or induction
// popup. Exported so the lead's own tabs use it too - before this the Overview
// tab had a different treatment per section (a full amber wash here, a bare
// grey box there, a naked heading somewhere else) and read as four unrelated
// things stacked up.
//
// Left edge rather than a full tint: four stacked panels each washed a
// different colour turned the popup into a paint chart. The edge and the
// plate carry the section's identity; the surface stays white.
export function DetailPanel({ title, icon: Icon, tone = 'blue', action, children }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 border-l-4 bg-white ${SECTION_EDGE[tone]}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3.5 py-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${DETAIL_TONES[tone]}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  )
}

function DetailSection({ title, icon: Icon, tone, entries, children }) {
  const filled = entries.filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (filled.length === 0 && !children) return null

  return (
    <DetailPanel title={title} icon={Icon} tone={tone}>
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
    </DetailPanel>
  )
}

// Recordings are Drive links now, which a <video> can't play - Drive serves a
// viewer page, not a media file, so pointing a player at one gives a black box.
// Older entries still hold a path to a file uploaded to this server back when
// the form took an upload, and those do still play inline; the two are told
// apart by whether the stored value is absolute.
function CallRecording({ url }) {
  const isExternal = /^https?:\/\//i.test(url)

  if (isExternal) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50"
      >
        <PlayCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        Open recording
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
      </a>
    )
  }

  return (
    <video
      controls
      preload="metadata"
      className="max-h-64 w-full rounded-md border border-slate-200 bg-slate-900"
      src={`${MEDIA_BASE_URL}${url}`}
    >
      <a href={`${MEDIA_BASE_URL}${url}`}>Download the recording</a>
    </video>
  )
}

export function InductionEntryDetail({ entry, hideAssignee = false }) {
  return (
    <div className="space-y-4">
      {/* Batch leads: it's the derived value everything else is filed under,
          and the first thing you check on an entry. Given the accent plate the
          tiles below gave up, so one thing on this tab carries real colour and
          it's the thing you look for first. */}
      <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
          <Layers className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-brand-700/70">Batch</p>
          <p className="text-base font-semibold leading-tight text-brand-700">{entry.batch}</p>
        </div>
        {hideAssignee ? null : (
          <div className="ml-auto min-w-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-brand-700/70">Assigned to</p>
            {entry.assigned_to_name ? (
              <p className="flex items-center justify-end gap-1.5 truncate text-sm font-semibold leading-tight text-slate-900">
                {entry.assigned_to_name}
                {entry.section && <Badge tone="violet">{entry.section.toUpperCase()}</Badge>}
              </p>
            ) : (
              <Badge tone="amber">Unassigned</Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        {entry.other_details?.call_recording_url && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Call Recording</p>
            <CallRecording url={entry.other_details.call_recording_url} />
          </div>
        )}
      </DetailSection>
    </div>
  )
}
