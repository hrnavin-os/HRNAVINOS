import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, ImageIcon, RefreshCw } from 'lucide-react'
import { leadService } from '@/services/leadService'
import { googleSheetsService } from '@/services/googleSheetsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDateTime } from '@/utils/formatters'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LeadAvatar } from '@/components/leads/LeadAvatar'
import { ResourceForm } from '@/components/resource/ResourceForm'

const reviewFields = [
  { name: 'name', label: 'Full Name', placeholder: 'Full Name', required: true },
  { name: 'phone', label: 'Mobile Number', placeholder: 'Mobile Number', required: true },
  { name: 'email', label: 'E-Mail ID', placeholder: 'E-Mail ID', type: 'email' },
  {
    name: 'course_interest',
    label: 'Program you are planning to join?',
    placeholder: 'Program you are planning to join?',
    required: true,
  },
  { name: 'batch_preference', label: 'Batch', placeholder: 'Batch' },
  {
    name: 'payment_expected',
    label: 'When will you make the payment?',
    placeholder: 'When will you make the payment?',
  },
  { name: 'notes', label: 'Any doubts or queries', placeholder: 'Any doubts or queries', type: 'textarea' },
]

function isImageValue(value) {
  if (!/^https?:\/\//i.test(value)) return false
  return /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(value) || /drive\.google\.com/i.test(value)
}

function toImageSrc(value) {
  const driveMatch = value.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/)
  if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`
  return value
}

function SubmittedAnswers({ rawFormData }) {
  const entries = Object.entries(rawFormData ?? {})
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No form data was captured for this submission.</p>
  }
  return (
    <div className="space-y-3">
      {entries.map(([question, answer]) => (
        <div key={question}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{question}</p>
          {isImageValue(answer) ? (
            <a href={answer} target="_blank" rel="noreferrer" className="mt-1 inline-block">
              <img
                src={toImageSrc(answer)}
                alt={question}
                className="max-h-48 rounded-md border border-slate-200 object-contain"
              />
            </a>
          ) : (
            <p className="break-words text-sm text-slate-700">{answer}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function PendingLeadCard({ lead, onApprove, approveError }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <LeadAvatar name={lead.name} />
          <div>
            <p className="font-medium text-slate-900">{lead.name}</p>
            <p className="text-xs text-slate-500">{lead.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">Needs Review</Badge>
          <span className="text-xs text-slate-400">Submitted {formatDateTime(lead.created_at)}</span>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <ImageIcon className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
            Submitted Answers
          </p>
          <div className="max-h-96 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-3">
            <SubmittedAnswers rawFormData={lead.raw_form_data} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Check &amp; Fill Details</p>
          <ResourceForm
            fields={reviewFields}
            defaultValues={{
              name: lead.name ?? '',
              phone: lead.phone ?? '',
              email: lead.email ?? '',
              course_interest: lead.course_interest ?? '',
              batch_preference: lead.batch_preference ?? '',
              payment_expected: lead.payment_expected ?? '',
              notes: lead.notes ?? '',
            }}
            onSubmit={(values) => onApprove(values)}
            onCancel={() => {}}
            submitLabel="Approve → Add to New Leads"
            submitError={approveError}
          />
        </div>
      </div>
    </div>
  )
}

export function FormCheckPage() {
  const queryClient = useQueryClient()
  const [syncMessage, setSyncMessage] = useState(null)

  const pendingQuery = useQuery({ queryKey: ['leads-pending-review'], queryFn: leadService.getPendingReview })

  const reviewMutation = useMutation({
    mutationFn: ({ id, values }) => leadService.review(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pending-review'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: googleSheetsService.syncNow,
    onSuccess: (data) => {
      setSyncMessage(`Sync complete — ${data.leads_created} new submission(s) to check.`)
      queryClient.invalidateQueries({ queryKey: ['leads-pending-review'] })
      setTimeout(() => setSyncMessage(null), 4000)
    },
    onError: (error) => setSyncMessage(getApiErrorMessage(error)),
  })

  const pendingLeads = pendingQuery.data ?? []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ClipboardCheck className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
            Form Check
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review new submissions synced from Google Sheets — check every answer and image, fix anything wrong,
            then approve to add them to Leads (CRM) as a New Lead.
          </p>
        </div>
        <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
          {syncMutation.isPending ? 'Syncing…' : 'Sync Sheets'}
        </Button>
      </div>

      {syncMessage && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">{syncMessage}</div>
      )}

      <ErrorMessage message={pendingQuery.error ? getApiErrorMessage(pendingQuery.error) : null} />

      {pendingQuery.isLoading ? (
        <LoadingSpinner />
      ) : pendingLeads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-sm text-slate-500">
          Nothing to check right now. New Google Sheets submissions will show up here.
        </div>
      ) : (
        <div className="space-y-4">
          {pendingLeads.map((lead) => (
            <PendingLeadCard
              key={lead.id}
              lead={lead}
              onApprove={(values) => reviewMutation.mutateAsync({ id: lead.id, values })}
              approveError={
                reviewMutation.isError && reviewMutation.variables?.id === lead.id
                  ? getApiErrorMessage(reviewMutation.error)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
