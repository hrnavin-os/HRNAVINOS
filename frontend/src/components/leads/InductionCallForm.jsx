import { useState } from 'react'
import { ClipboardCheck, Copy, ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { InductionFormEditModal } from '@/components/leads/InductionFormEditModal'
import { CARD_PLATE_CLASSES, CARD_TONE_CLASSES } from '@/constants/sectionTones'

// The Induction tab is just the shareable link, mirroring how the Foundation
// tab is just its section cards. Entries arrive through the public form at
// /induction-form and are assigned to a Section Admin on the way in, so there
// is nothing to key in or manage here.
export function InductionCallForm() {
  const { hasPermission } = useAuth()
  const canConfigure = hasPermission(PERMISSIONS.FORM_COLLECTION_CONFIGURE)
  const [copied, setCopied] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const formUrl = `${window.location.origin}/induction-form`

  async function copyLink() {
    await navigator.clipboard.writeText(formUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    // Same grid the Foundation tab uses, so switching tabs doesn't reflow the
    // page - a single card here, but it sits in the same column.
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className={`flex h-full flex-col justify-between gap-4 rounded-xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${CARD_TONE_CLASSES.blue}`}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${CARD_PLATE_CLASSES.blue}`}>
          <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Induction Call Form</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Share this link to collect details. Each submission is assigned to a section admin automatically.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3! py-1.5! text-xs" onClick={copyLink}>
          <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <a
          href={formUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Open form
        </a>
        {canConfigure && (
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            title="Edit form"
            aria-label="Edit Induction Call Form"
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white hover:text-brand-600"
          >
            <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      </div>

      {isEditOpen && <InductionFormEditModal onClose={() => setIsEditOpen(false)} />}
    </div>
  )
}
