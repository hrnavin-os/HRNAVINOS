import { Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MEDIA_BASE_URL } from '@/constants/config'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import {
  ADDRESS_FIELDS,
  BANK_FIELDS,
  EMPLOYMENT_FIELDS,
  IDENTITY_FIELDS,
  PERSONAL_FIELDS,
  fullName,
} from '@/components/users/staffProfile'


function display(field, value) {
  if (value === null || value === undefined || value === '') return null
  if (field.type === 'date') return formatDate(value)
  if (field.type === 'number') return formatCurrency(value)
  return value
}

function Row({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3 sm:p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

const fieldRows = (fields, source) =>
  fields.map((field) => (
    <Row key={field.name} label={field.label}>
      {display(field, source?.[field.name])}
    </Row>
  ))

function formatAddress(address) {
  const parts = ADDRESS_FIELDS.map((field) => address?.[field.name]).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// Everything the Users form collects, read back section by section. Shared by
// the Users and Staffs view popups. `extra` rows (deletion details, say) are
// appended to the account section.
export function StaffProfileView({ user, extra = [] }) {
  const documents = user.identity?.documents ?? []
  return (
    <div className="space-y-3">
      <Section title="Account">
        <Row label="Name">{fullName(user)}</Row>
        <Row label="Mobile">{user.phone}</Row>
        <Row label="Role">{user.role?.name}</Row>
        <Row label="Department">{user.department?.name}</Row>
        <Row label="Login Email">{user.email ?? (user.can_sign_in === false ? 'No login' : null)}</Row>
        <Row label="Status">
          <Badge tone={user.is_active ? 'green' : 'slate'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
        </Row>
        <Row label="Last Login">{user.last_login_at ? formatDateTime(user.last_login_at) : null}</Row>
        <Row label="Created">{formatDate(user.created_at)}</Row>
        {extra.map((item) => (
          <Row key={item.label} label={item.label}>
            {item.value || null}
          </Row>
        ))}
      </Section>

      <Section title="Personal Details">{fieldRows(PERSONAL_FIELDS, user.personal)}</Section>
      <Section title="Employment Details">{fieldRows(EMPLOYMENT_FIELDS, user.employment)}</Section>

      <Section title="ID & Documents">
        {fieldRows(IDENTITY_FIELDS, user.identity)}
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-slate-500">Documents</dt>
          <dd className="mt-1">
            {documents.length ? (
              <ul className="flex flex-wrap gap-2">
                {documents.map((document, index) => (
                  <li key={`${document.url}-${index}`}>
                    <a
                      href={`${MEDIA_BASE_URL}${document.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      {document.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </dd>
        </div>
      </Section>

      <Section title="Address">
        <Row label="Current Address">{formatAddress(user.address?.current)}</Row>
        <Row label="Permanent Address">
          {user.address?.permanent_same_as_current ? 'Same as current' : formatAddress(user.address?.permanent)}
        </Row>
      </Section>

      <Section title="Bank Details">{fieldRows(BANK_FIELDS, user.bank)}</Section>
    </div>
  )
}
