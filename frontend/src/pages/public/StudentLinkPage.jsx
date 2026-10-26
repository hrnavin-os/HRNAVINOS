import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CirclePlay, Lock, Video } from 'lucide-react'
import { PublicFormShell } from '@/components/public/PublicFormShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { studentLinkService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDate, formatDateTime } from '@/utils/formatters'

function TermsStep({ token, page }) {
  const queryClient = useQueryClient()
  const [signedName, setSignedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [file, setFile] = useState(null)
  const accept = useMutation({
    mutationFn: () => studentLinkService.acceptTerms(token, { signedName, agreed, file }),
    onSuccess: (updated) => queryClient.setQueryData(['student-link', token], updated),
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Step 1 · Before your classes</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{page.terms_title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Please read the terms below. Your live classes and recordings open as soon as you agree.
        </p>
      </div>
      {/* Plain text, shown as written: the terms are stored as text, not markup. */}
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
        {page.terms_body || 'The terms have not been published yet. Please contact the institute.'}
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          accept.mutate()
        }}
      >
        <Input
          label="Type your full name as your signature"
          required
          maxLength={150}
          autoComplete="name"
          value={signedName}
          onChange={(event) => setSignedName(event.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Signed copy (optional)</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            If you were sent a printed copy to sign, attach a photo or scan of it here.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          I have read and agree to the {page.terms_title}.
        </label>
        <ErrorMessage message={accept.error && getApiErrorMessage(accept.error)} />
        <Button type="submit" className="w-full" disabled={!agreed || signedName.trim().length < 2 || accept.isPending}>
          {accept.isPending ? 'Submitting…' : 'I agree'}
        </Button>
      </form>
    </div>
  )
}

function ClassRow({ token, entry, onWatched }) {
  const [error, setError] = useState(null)
  const open = useMutation({
    mutationFn: () => studentLinkService.openRecording(token, entry.id),
  })

  async function watch() {
    setError(null)
    // Opened before the request, while the click still counts as the user's:
    // a window opened after an await is a popup, and browsers block those.
    const tab = window.open('', '_blank')
    // What noopener would have done, had it not also taken away the handle
    // this needs: the recording's page gets no way back into this one.
    if (tab) tab.opener = null
    try {
      const url = await open.mutateAsync()
      if (tab) tab.location.href = url
      else window.location.assign(url)
      onWatched()
    } catch (exc) {
      tab?.close()
      setError(getApiErrorMessage(exc))
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            <span className="mr-1.5 text-slate-400">{entry.sequence}.</span>
            {entry.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(entry.held_on)}
            {entry.start_time && ` · ${entry.start_time}`}
            {entry.watched && (
              <span className="ml-2">
                <Badge tone="green">Watched</Badge>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {entry.meet_url && (
            <a
              href={entry.meet_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Video className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Join class
            </a>
          )}
          {entry.has_recording ? (
            <Button variant="secondary" onClick={watch} disabled={open.isPending}>
              <CirclePlay className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {entry.watched ? 'Watch again' : 'Watch recording'}
            </Button>
          ) : (
            !entry.meet_url && <span className="text-xs text-slate-400">Recording coming soon</span>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorMessage message={error} />
        </div>
      )}
    </li>
  )
}

function ClassesStep({ token, page, onWatched }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        <p>
          Terms &amp; Conditions accepted on {formatDateTime(page.terms_accepted_at)}. Your classes are below.
        </p>
      </div>
      {page.classes.length ? (
        <ul className="divide-y divide-slate-100">
          {page.classes.map((entry) => (
            <ClassRow key={entry.id} token={token} entry={entry} onWatched={onWatched} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          Your classes haven&rsquo;t been scheduled yet. Check back soon.
        </p>
      )}
    </div>
  )
}

/**
 * A student's private page, opened from the link they were sent. No login:
 * the token in the address is who they are. The terms come first, and until
 * they are agreed nothing else is shown - the API returns no classes before
 * then, so this is not just the page hiding them.
 */
export function StudentLinkPage() {
  const { token } = useParams()
  const query = useQuery({
    queryKey: ['student-link', token],
    queryFn: () => studentLinkService.get(token),
    retry: false,
  })

  const page = query.data
  return (
    <PublicFormShell
      title={page ? `Hi, ${page.name}` : 'Student Portal'}
      subtitle={page ? [page.course_name, page.batch_name].filter(Boolean).join(' · ') || 'HRNAVINOS' : 'HRNAVINOS'}
      wide
    >
      {query.isLoading ? (
        <div className="py-6">
          <LoadingSpinner />
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Lock className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm text-slate-600">{getApiErrorMessage(query.error)}</p>
        </div>
      ) : page.terms_signed ? (
        <ClassesStep token={token} page={page} onWatched={() => query.refetch()} />
      ) : (
        <TermsStep token={token} page={page} />
      )}
    </PublicFormShell>
  )
}
