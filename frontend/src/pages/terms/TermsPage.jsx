import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, FileSignature, Pencil, Search, Undo2, Users } from 'lucide-react'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useAuth } from '@/hooks/useAuth'
import { termsService } from '@/services/termsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { PERMISSIONS } from '@/constants/permissions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Input, FIELD } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import { TabStrip } from '@/components/ui/TabStrip'
import { TableCard } from '@/components/ui/TableCard'
import { Toast } from '@/components/ui/Toast'
import { formatDate, formatDateTime, titleCase } from '@/utils/formatters'

// The three tabs, and the `filter` each sends to the register endpoint. All
// students is first because it is the roll: the other two are that same list
// split by whether a signed form has come back, and they add up to it.
const TABS = [
  { key: 'all', label: 'All Students', icon: Users },
  { key: 'signed', label: 'Signed Students', icon: Check },
  { key: 'not_signed', label: 'Not Signed Students', icon: FileSignature },
]

// How an induction entry's own status reads in this register. Shown because
// chasing a signature is wasted effort on somebody who quit, and because a
// student who has moved to Foundation is further along than the tab implies.
const STATUS_TONES = {
  pending_induction: 'blue',
  moved_to_foundation: 'emerald',
  quit: 'red',
}

// The terms text itself, above the register - so whoever is chasing signatures
// can read what is being agreed to without going and finding the document.
// Collapsed by default: it is reference material, and the register is the
// working surface.
function TermsDocumentPanel({ canEdit, onError }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['terms-document'], queryFn: termsService.getDocument })
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const save = useMutation({
    mutationFn: () => termsService.updateDocument({ title: title.trim(), body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['terms-document'], updated)
      setIsEditing(false)
    },
    onError: (error) => onError(`Couldn't save the terms: ${getApiErrorMessage(error)}`),
  })

  function startEditing() {
    setTitle(data?.title ?? '')
    setBody(data?.body ?? '')
    setIsEditing(true)
    setIsOpen(true)
  }

  const hasBody = Boolean(data?.body?.trim())

  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span className="h-8 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-900">
              {data?.title || 'Terms & Conditions'}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {hasBody
                ? data?.updated_at
                  ? `Last updated ${formatDate(data.updated_at)}${
                      data.updated_by_name ? ` by ${data.updated_by_name}` : ''
                    }`
                  : 'The document students are signing'
                : 'No terms written yet'}
            </span>
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        {canEdit && !isEditing && (
          <Button variant="secondary" className="px-2.5! py-1.5! text-xs" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {hasBody ? 'Edit terms' : 'Write terms'}
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-slate-200 px-4 py-3">
          {isEditing ? (
            <>
              <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Terms</span>
                <textarea
                  rows={12}
                  maxLength={20000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type the terms students are agreeing to…"
                  className={`${FIELD} resize-y py-2 leading-relaxed`}
                />
              </label>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{body.length}/20000</span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="px-3! py-1.5! text-xs"
                    onClick={() => setIsEditing(false)}
                    disabled={save.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="px-3! py-1.5! text-xs"
                    onClick={() => save.mutate()}
                    disabled={save.isPending || !title.trim()}
                  >
                    {save.isPending ? 'Saving…' : 'Save terms'}
                  </Button>
                </div>
              </div>
            </>
          ) : hasBody ? (
            // Pre-wrapped rather than rendered as markup: the document is
            // stored as plain text, and the line breaks whoever wrote it put
            // in are the only formatting it has.
            <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {data.body}
            </p>
          ) : (
            <p className="py-4 text-center text-xs text-slate-400">
              Nothing written yet.{canEdit ? ' Use Write terms to add the document students sign.' : ''}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// Admin > Terms & Conditions: who has signed the terms and who still owes one.
//
// The roll is the induction list - everyone who came through an induction
// call, whatever has become of them since - because that is who is asked to
// sign. It is not the Students collection, which only fills up once a batch is
// confirmed and would therefore be missing most of the people being chased.
//
// "Signed" is the same field the induction update form's fourth page has
// always written, so a tick made here shows up there and vice versa. Two
// places storing the same fact would be two places to disagree.
export function TermsPage() {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const canSign = hasPermission(PERMISSIONS.TERMS_SIGN)
  const canEdit = hasPermission(PERMISSIONS.TERMS_CONFIGURE)

  const [tab, setTab] = useState('all')
  const [error, setError] = useState(null)

  const query = usePaginatedQuery('terms-students', termsService, { filter: tab })
  const { setPage, search, setSearch } = query

  // A page number belongs to the tab it was set on: page 3 of All Students is
  // not page 3 of the four people who have signed.
  useEffect(() => {
    setPage(1)
  }, [tab, setPage])

  const statsQuery = useQuery({ queryKey: ['terms-stats'], queryFn: termsService.getStats })
  const stats = statsQuery.data
  const countFor = { all: stats?.total, signed: stats?.signed, not_signed: stats?.not_signed }

  const toggle = useMutation({
    mutationFn: ({ id, signed }) => (signed ? termsService.markNotSigned(id) : termsService.markSigned(id)),
    onSuccess: () => {
      // Both lists change when a student moves side: the tab they were on
      // loses a row, the other gains one, and every count moves.
      queryClient.invalidateQueries({ queryKey: ['terms-students'] })
      queryClient.invalidateQueries({ queryKey: ['terms-stats'] })
    },
    onError: (mutationError) =>
      setError(`Couldn't update the signature: ${getApiErrorMessage(mutationError)}`),
  })

  const columns = [
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="truncate text-xs text-slate-500">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      align: 'center',
      render: (row) =>
        row.section ? (
          <Badge tone="blue">{row.section.toUpperCase()} Section</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'batch', header: 'Batch', align: 'center' },
    {
      key: 'registration_date',
      header: 'Registered',
      align: 'center',
      render: (row) => formatDate(row.registration_date),
    },
    {
      key: 'status',
      header: 'Induction',
      align: 'center',
      render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
    },
    {
      key: 'signed',
      header: 'Terms',
      align: 'center',
      render: (row) =>
        row.signed ? (
          <div className="min-w-0">
            <Badge tone="emerald">Signed</Badge>
            {/* Who vouched for it and when. A register that says "signed"
                with nobody against it is a claim, not a record. */}
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {row.signed_at ? formatDateTime(row.signed_at) : ''}
              {row.signed_by_name ? ` · ${row.signed_by_name}` : ''}
            </p>
          </div>
        ) : (
          <Badge tone="amber">Not signed</Badge>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'center',
      render: (row) =>
        canSign ? (
          <Button
            variant={row.signed ? 'ghost' : 'success'}
            className="px-2.5! py-1! text-xs"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ id: row.id, signed: row.signed })}
          >
            {row.signed ? (
              <>
                <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Undo
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                Mark signed
              </>
            )}
          </Button>
        ) : null,
    },
  ]

  return (
    <div>
      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-9 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900">Terms &amp; Conditions</h1>
              <p className="text-[11px] font-medium text-amber-600">
                Who has signed the terms, and who still owes one
              </p>
            </div>
          </div>
          <TabStrip
            equal
            // The count rides in the tab, so how much is behind each one is
            // readable without opening it.
            tabs={TABS.map((item) => ({
              ...item,
              label:
                countFor[item.key] === undefined ? item.label : `${item.label} (${countFor[item.key]})`,
            }))}
            value={tab}
            onChange={setTab}
            className="min-w-0 flex-1 basis-lg"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5">
          <div className="w-full sm:w-72">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search by name, phone, email…"
              rightElement={<Search className="h-4 w-4 text-slate-400" aria-hidden="true" />}
            />
          </div>
          <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
            {query.total} {query.total === 1 ? 'student' : 'students'}
          </span>
        </div>
      </div>

      <TermsDocumentPanel canEdit={canEdit} onError={setError} />

      <TableCard>
        <DataTable
          columns={columns}
          rows={query.items}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={
            tab === 'signed'
              ? 'Nobody has been marked as signed yet.'
              : tab === 'not_signed'
                ? 'Everyone on the induction list has signed.'
                : 'No students on the induction list yet.'
          }
        />
        <Pagination
          page={query.page}
          totalPages={query.totalPages}
          onPageChange={setPage}
          total={query.total}
          pageSize={query.pageSize}
        />
      </TableCard>

      <Toast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
