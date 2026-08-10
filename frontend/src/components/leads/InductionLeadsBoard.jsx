import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { inductionEntryService } from '@/services/inductionEntryService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
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
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterDropdown } from '@/components/ui/FilterDropdown'
import { LeadSectionStats } from '@/components/leads/LeadSectionStats'
import { InductionUpdateModal } from '@/components/leads/InductionUpdateModal'
import { MEDIA_BASE_URL } from '@/constants/config'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate } from '@/utils/formatters'

const dash = <span className="text-slate-400">—</span>
const orDash = (value) => value || dash

// Induction submissions are their own records, not Leads, so this board has
// its own columns rather than reusing the Foundation ones - there is no stage,
// payment plan or query on an induction entry.
//
// No create form: entries arrive through the shareable form in
// Admin > Form Collection. Editing stays available for corrections.
const columns = [
  { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
  {
    // Phone over email is a deliberate two-line stack, not wrapping - each
    // line is still a single unbroken value.
    key: 'contact',
    header: 'Contact',
    render: (row) => (
      <div className="min-w-0">
        <p className="tabular-nums text-slate-700">{row.phone}</p>
        {row.email && <p className="truncate text-xs text-slate-500">{row.email}</p>}
      </div>
    ),
  },
  {
    // Derived server-side from the registration date, so it is never edited
    // and never drifts from it.
    key: 'batch',
    header: 'Batch',
    align: 'center',
    render: (row) => <Badge tone="blue">{row.batch}</Badge>,
  },
  {
    key: 'registration_date',
    header: 'Registration',
    align: 'center',
    render: (row) => formatDate(row.registration_date),
  },
  {
    key: 'paid_date',
    header: 'Paid',
    align: 'center',
    render: (row) => (row.paid_date ? formatDate(row.paid_date) : dash),
  },
  { key: 'sales_person', header: 'Sales Person', render: (row) => orDash(row.sales_person) },
  {
    key: 'lead_source',
    header: 'Lead Source',
    render: (row) => (row.lead_source ? <Badge tone="amber">{row.lead_source}</Badge> : dash),
  },
  {
    key: 'payment_mode',
    header: 'Payment Mode',
    render: (row) => (row.payment_mode ? <span className="text-slate-700">{row.payment_mode}</span> : dash),
  },
  {
    key: 'category',
    header: 'Category',
    render: (row) => (row.category ? <Badge tone="emerald">{row.category}</Badge> : dash),
  },
  {
    // Assigned round-robin across Section Admins when the form is submitted.
    key: 'assigned_to',
    header: 'Assigned To',
    render: (row) =>
      row.assigned_to_name ? (
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-slate-900">{row.assigned_to_name}</span>
          {row.section && <Badge tone="violet">{row.section.toUpperCase()}</Badge>}
        </span>
      ) : (
        <span className="text-amber-600">Unassigned</span>
      ),
  },
]

// A row's post-call details are "started" once any one of the four pages has
// an answer - used to label the Update button so you can see at a glance which
// entries still need working.
function hasDetails(entry) {
  return [entry.qualification, entry.placement, entry.remarks, entry.other_details].some((group) =>
    Object.values(group ?? {}).some((value) => value !== null && value !== undefined && value !== ''),
  )
}

const editFields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone Number', required: true },
  { name: 'registration_date', label: 'Registration Date', type: 'date', required: true },
  { name: 'paid_date', label: 'Paid Date', type: 'date' },
  { name: 'sales_person', label: 'Sales Person' },
  { name: 'lead_source', label: 'Lead Source' },
  { name: 'payment_mode', label: 'Payment Mode' },
  { name: 'category', label: 'Category' },
]

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

function InductionEntryDetail({ entry }) {
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
          {entry.assigned_to_name ? (
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

// null stays null so an unanswered yes/no is skipped rather than shown as "No".
const yesNo = (value) => (value === true ? 'Yes' : value === false ? 'No' : null)


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

const EMPTY_FILTERS = {
  batch: '',
  sales_person: '',
  lead_source: '',
  payment_mode: '',
  category: '',
  assigned_to: '',
}

export function InductionLeadsBoard() {
  const { user } = useAuth()
  const scopedSection = user?.scoped_section || null
  const [sectionFilter, setSectionFilter] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  const hasFilters = Object.values(filters).some(Boolean)
  // Empty strings would be sent as `?batch=` and match nothing, so only the
  // set ones reach the query.
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))

  // A Section Admin is pinned to their own section, exactly as on the
  // Foundation board - the role carries it, so it can't be changed by clicking.
  const effectiveSection = scopedSection || sectionFilter

  // Keyed under the list's own key so ResourceListPage's invalidation after an
  // edit or delete refreshes the cards too - React Query matches by prefix.
  const statsQuery = useQuery({
    queryKey: ['induction-entries', 'stats'],
    queryFn: inductionEntryService.getStats,
  })

  // Sections are admin-managed and open-ended, so the cards read live from the
  // form config rather than a fixed list - same source the Foundation cards use.
  const configQuery = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  const [updatingEntry, setUpdatingEntry] = useState(null)

  const optionsQuery = useQuery({
    queryKey: ['induction-entries', 'filter-options'],
    queryFn: inductionEntryService.getFilterOptions,
  })

  const sections = configQuery.data?.sections ?? []
  const visibleSections = scopedSection ? sections.filter((s) => s.code === scopedSection) : sections

  // Plain string lists come back for everything except Assigned To, which
  // needs an id to filter on and a name to show.
  const asOptions = (values) => (values ?? []).map((value) => ({ value, label: value }))
  const options = optionsQuery.data ?? {}

  return (
    <>
      <LeadSectionStats
        allLabel="All Entries"
        total={statsQuery.data?.total ?? 0}
        sections={visibleSections}
        bySection={statsQuery.data?.by_section ?? {}}
        activeSection={effectiveSection}
        onSelect={scopedSection ? () => {} : setSectionFilter}
      />
      <ResourceListPage
        // Rendered inline beside the search box rather than as a band above
        // it - same job, and two stacked rows pushed the table off screen.
        renderFilters={() => (
          <>
            <FilterDropdown
              grow
              label="Batch"
              value={filters.batch}
              options={asOptions(options.batch)}
              onChange={(value) => setFilter('batch', value)}
            />
            <FilterDropdown
              grow
              label="Sales Person"
              value={filters.sales_person}
              options={asOptions(options.sales_person)}
              onChange={(value) => setFilter('sales_person', value)}
            />
            <FilterDropdown
              grow
              label="Lead Source"
              value={filters.lead_source}
              options={asOptions(options.lead_source)}
              onChange={(value) => setFilter('lead_source', value)}
            />
            <FilterDropdown
              grow
              label="Payment Mode"
              value={filters.payment_mode}
              options={asOptions(options.payment_mode)}
              onChange={(value) => setFilter('payment_mode', value)}
            />
            <FilterDropdown
              grow
              label="Category"
              value={filters.category}
              options={asOptions(options.category)}
              onChange={(value) => setFilter('category', value)}
            />
            <FilterDropdown
              grow
              label="Assignee"
              value={filters.assigned_to}
              options={options.assigned_to ?? []}
              onChange={(value) => setFilter('assigned_to', value)}
            />
            {hasFilters && (
              <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Clear
              </Button>
            )}
          </>
        )}
        title="Induction Entry"
        queryKey="induction-entries"
        service={inductionEntryService}
        columns={[
          ...columns,
          {
            // Last column, before Actions: opens the four-page post-call form.
            key: 'update',
            header: 'Update',
            align: 'center',
            render: (row) => (
              <Button
                variant="secondary"
                className="px-3! py-1! text-xs"
                onClick={(event) => {
                  event.stopPropagation()
                  setUpdatingEntry(row)
                }}
              >
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {hasDetails(row) ? 'Edit' : 'Update'}
              </Button>
            ),
          },
        ]}
        serialNumber
        extraParams={{ section: effectiveSection || undefined, ...activeFilters }}
        rowActions={{
        view: {
          title: (row) => row.name,
          maxWidth: 'max-w-xl',
          renderBody: (row) => <InductionEntryDetail entry={row} />,
        },
        edit: {
          title: (row) => `Edit ${row.name}`,
          permission: PERMISSIONS.LEADS_UPDATE,
          fields: editFields,
          // Dates arrive as ISO strings; <input type="date"> wants YYYY-MM-DD,
          // which is the leading 10 characters either way.
          defaults: (row) => ({
            name: row.name,
            email: row.email ?? '',
            phone: row.phone,
            registration_date: row.registration_date?.slice(0, 10) ?? '',
            paid_date: row.paid_date?.slice(0, 10) ?? '',
            sales_person: row.sales_person ?? '',
            lead_source: row.lead_source ?? '',
            payment_mode: row.payment_mode ?? '',
            category: row.category ?? '',
          }),
        },
          remove: {
            permission: PERMISSIONS.LEADS_DELETE,
            describe: (row) => `${row.name} (${row.phone})`,
          },
        }}
      />

      {updatingEntry && (
        <InductionUpdateModal entry={updatingEntry} onClose={() => setUpdatingEntry(null)} />
      )}
    </>
  )
}
