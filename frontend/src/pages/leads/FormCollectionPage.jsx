import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, Copy, ExternalLink, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { TabStrip } from '@/components/ui/TabStrip'
import { leadService } from '@/services/leadService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { FormCollectionEditModal } from '@/components/leads/FormCollectionEditModal'
import { InductionCallForm } from '@/components/leads/InductionCallForm'
import { CARD_PLATE_CLASSES, CARD_TONE_CLASSES, sectionToneAt } from '@/constants/sectionTones'

function SectionCard({ section, tone, canConfigure, onEdit, onDelete, isDeleting }) {
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
      className={`flex h-full cursor-pointer flex-col justify-between gap-4 rounded-xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        CARD_TONE_CLASSES[tone] ?? CARD_TONE_CLASSES.blue
      }`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${
            CARD_PLATE_CLASSES[tone] ?? CARD_PLATE_CLASSES.blue
          }`}
        >
          <ClipboardCheck className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{section.label}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {countQuery.isLoading ? 'Loading…' : `${countQuery.data?.total ?? 0} submissions`}
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

// Each tab keeps its accent as the raised pill's text colour, matching the
// Induction/Foundation switch in the header - same two things being chosen
// between, so it should not be a differently-shaped control.
const TABS = [
  { key: 'induction', label: 'Induction Call Form', active: 'bg-white text-brand-700 shadow-sm' },
  { key: 'foundation', label: 'Foundation Call Form', active: 'bg-white text-violet-700 shadow-sm' },
]

export function FormCollectionPage() {
  const [activeTab, setActiveTab] = useState('induction')

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <TabStrip tabs={TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'induction' ? <InductionCallForm /> : <FoundationCallForm />}
    </div>
  )
}

// Everything that was previously the whole page, moved behind a tab with no
// changes to what it renders or how it behaves.
function FoundationCallForm() {
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
  const ownSection = sections.find((section) => section.code === user?.scoped_section)
  const visibleSections = ownSection ? [ownSection] : sections

  return (
    <div>
      <div className="mb-4 flex items-start justify-end gap-3">
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

      {/* Grid rather than a stacked list: these are peers, and one per row
          left most of the width empty once there were more than two. */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <SectionCard
            key={section.code}
            section={section}
            // Keyed on position in the full section list, not the visible
            // one, so a Section Admin seeing only their own card still gets
            // the colour that section has everywhere else.
            tone={sectionToneAt(sections.findIndex((s) => s.code === section.code))}
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
