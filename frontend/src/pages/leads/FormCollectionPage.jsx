import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Copy, ExternalLink, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { FormCollectionEditModal } from '@/components/leads/FormCollectionEditModal'

// The backend auto-creates a matching "Admin <CODE>-Section" role (scoped
// to just that section's leads) the moment a section is added - see
// FoundationFormConfigService.add_section / _ensure_section_role.
function roleNameForSection(code) {
  return `Admin ${code.toUpperCase()}-Section`
}

function SectionCard({ section, canConfigure, onEdit, onDelete, isDeleting }) {
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
      className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{section.label}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {countQuery.isLoading ? 'Loading…' : `${countQuery.data?.total ?? 0} submissions`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
        {canConfigure && (
          <button
            type="button"
            title="Delete this form"
            disabled={isDeleting}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

export function FormCollectionPage() {
  const { user, hasPermission } = useAuth()
  const canConfigure = hasPermission(PERMISSIONS.FORM_COLLECTION_CONFIGURE)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: foundationFormConfigService.get,
  })

  const addSectionMutation = useMutation({
    mutationFn: () => foundationFormConfigService.addSection(),
    onSuccess: (updated) => queryClient.setQueryData(['foundation-form-config'], updated),
  })

  const deleteSectionMutation = useMutation({
    mutationFn: (code) => foundationFormConfigService.deleteSection(code),
    onSuccess: (updated) => queryClient.setQueryData(['foundation-form-config'], updated),
  })

  function handleDelete(section) {
    if (!window.confirm(`Delete "${section.label}"? Its public link will stop working immediately.`)) return
    deleteSectionMutation.mutate(section.code)
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={getApiErrorMessage(error)} />

  const sections = config?.sections ?? []
  const ownSection = sections.find((section) => roleNameForSection(section.code) === user?.role)
  const visibleSections = ownSection ? [ownSection] : sections

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ClipboardCheck className="h-5 w-5 text-brand-600" strokeWidth={2} aria-hidden="true" />
            Form Collection
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Share a section's link with prospective students on a call or meet. When they submit it, their details
            are added straight to Admin, filed under that section.
          </p>
        </div>
        {canConfigure && (
          <Button onClick={() => addSectionMutation.mutate()} disabled={addSectionMutation.isPending}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {addSectionMutation.isPending ? 'Adding…' : 'Add Form'}
          </Button>
        )}
      </div>

      <ErrorMessage
        message={
          addSectionMutation.error
            ? getApiErrorMessage(addSectionMutation.error)
            : deleteSectionMutation.error
              ? getApiErrorMessage(deleteSectionMutation.error)
              : null
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        {visibleSections.map((section) => (
          <SectionCard
            key={section.code}
            section={section}
            canConfigure={canConfigure}
            onEdit={() => setIsEditOpen(true)}
            onDelete={() => handleDelete(section)}
            isDeleting={deleteSectionMutation.isPending && deleteSectionMutation.variables === section.code}
          />
        ))}
      </div>

      {isEditOpen && <FormCollectionEditModal onClose={() => setIsEditOpen(false)} />}
    </div>
  )
}
