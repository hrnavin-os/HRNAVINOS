import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, MessageCircle } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const QUERY_KEY = ['whatsapp-links']

// Mirrors WHATSAPP_INVITE_PATTERN on the backend so a bad link is caught
// before a round-trip; the server still validates, this is just the faster
// half of the same rule.
const INVITE_PATTERN = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/

function SectionLinkCard({ section }) {
  const queryClient = useQueryClient()
  const saved = section.whatsapp_group_url ?? ''
  const [value, setValue] = useState(saved)
  const [validationError, setValidationError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const mutation = useMutation({
    mutationFn: (url) => batchConfirmationService.updateWhatsappLink(section.code, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    },
  })

  function handleUpdate() {
    const trimmed = value.trim()
    // Empty is allowed - that's how a link gets removed once a group closes.
    if (trimmed && !INVITE_PATTERN.test(trimmed)) {
      setValidationError('Enter a WhatsApp group invite link, e.g. https://chat.whatsapp.com/AbC123…')
      return
    }
    setValidationError(null)
    mutation.mutate(trimmed)
  }

  const isDirty = value.trim() !== saved

  return (
    <div className="flex min-w-72 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
          <MessageCircle className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{section.label}</h3>
          <p className="text-xs text-slate-500">WhatsApp Group</p>
        </div>
      </div>

      <Input
        label="Group invite link"
        placeholder="https://chat.whatsapp.com/…"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setValidationError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleUpdate()
        }}
        error={validationError}
      />

      {!validationError && mutation.error && (
        <div className="mt-2">
          <ErrorMessage message={getApiErrorMessage(mutation.error)} />
        </div>
      )}

      {saved && (
        <a
          href={saved}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 self-start text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Open current group
        </a>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-green-600">
          {justSaved && (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Saved
            </span>
          )}
        </span>
        <Button onClick={handleUpdate} disabled={mutation.isPending || !isDirty}>
          {mutation.isPending ? 'Updating…' : 'Update'}
        </Button>
      </div>
    </div>
  )
}

export function WhatsAppLinksPage() {
  const { data, isLoading, error } = useQuery({ queryKey: QUERY_KEY, queryFn: batchConfirmationService.whatsappLinks })

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={getApiErrorMessage(error)} />

  const sections = data ?? []

  return (
    <div>
      {sections.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          No sections configured yet.
        </p>
      ) : (
        // One card per configured section rather than three fixed columns -
        // sections are admin-managed, so a newly added one appears here on
        // its own. Wraps to a single column on narrow screens.
        <div className="flex flex-wrap gap-4">
          {sections.map((section) => (
            <SectionLinkCard key={section.code} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
