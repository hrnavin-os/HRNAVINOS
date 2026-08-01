import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Copy, ExternalLink, Pencil, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { leadService } from '@/services/leadService'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { FormCollectionEditModal } from '@/components/leads/FormCollectionEditModal'

// All three sections share one form structure (fields, pricing) - the only
// difference is which role's members can access which section's leads
// (enforced server-side, see backend/app/core/dependencies.py:get_actor_scope).
const SECTION_DEFS = [
  { code: 'a', label: 'A Section', roleName: 'A-Section Admin' },
  { code: 'b', label: 'B Section', roleName: 'B-Section Admin' },
  { code: 'c', label: 'C Section', roleName: 'C-Section Admin' },
]

function SectionCard({ section, canConfigure, onEdit }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const formUrl = `${window.location.origin}/foundation-form/${section.code}`

  const countQuery = useQuery({
    queryKey: ['form-collection-count', section.code],
    queryFn: () => leadService.list({ section: section.code, page_size: 1 }),
  })

  async function copyLink(event) {
    event.stopPropagation()
    await navigator.clipboard.writeText(formUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/leads?section=${section.code}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/leads?section=${section.code}`)
      }}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        {canConfigure && (
          <Button
            type="button"
            variant="secondary"
            className="px-3! py-1.5! text-xs"
            onClick={(event) => {
              event.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Edit
          </Button>
        )}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{section.label}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
        <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {countQuery.isLoading ? 'Loading…' : `${countQuery.data?.total ?? 0} submissions`}
      </p>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" className="px-3! py-1.5! text-xs" onClick={copyLink}>
          <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <a
          href={formUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Preview
        </a>
      </div>
    </div>
  )
}

export function FormCollectionPage() {
  const { user, hasPermission } = useAuth()
  const canConfigure = hasPermission(PERMISSIONS.FORM_COLLECTION_CONFIGURE)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const ownSection = SECTION_DEFS.find((section) => section.roleName === user?.role)
  const visibleSections = ownSection ? [ownSection] : SECTION_DEFS

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <ClipboardCheck className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
          Form Collection
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Share a section's link with prospective students on a call or meet. When they submit it, their details
          are added straight to Admin, filed under that section.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {visibleSections.map((section) => (
          <SectionCard key={section.code} section={section} canConfigure={canConfigure} onEdit={() => setIsEditOpen(true)} />
        ))}
      </div>

      {isEditOpen && <FormCollectionEditModal onClose={() => setIsEditOpen(false)} />}
    </div>
  )
}
