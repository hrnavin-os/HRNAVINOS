import { useState } from 'react'
import { ClipboardCheck, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function FoundationFormAdminPage() {
  const [copied, setCopied] = useState(false)
  const formUrl = `${window.location.origin}/foundation-form`

  async function copyLink() {
    await navigator.clipboard.writeText(formUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <ClipboardCheck className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
          Foundation Form
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Share this link with prospective students on a call or meet. When they submit it, their details are
          added straight to Admin.
        </p>
      </div>

      <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-sm font-medium text-slate-700">Shareable form link</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={formUrl}
            onFocus={(event) => event.target.select()}
            className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm"
          />
          <Button type="button" variant="secondary" onClick={copyLink}>
            <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <a
          href={formUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Preview the form
        </a>
      </div>
    </div>
  )
}
