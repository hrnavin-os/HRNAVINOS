import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { roleService } from '@/services/roleService'
import { permissionService } from '@/services/permissionService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { actionLabel, groupPermissions } from '@/constants/permissionLabels'

function PermissionGroup({ menu, permissions, selected, onToggle, onToggleAll }) {
  const allSelected = permissions.every((p) => selected.has(p.id))
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{menu.label}</p>
          {menu.hint && <p className="mt-0.5 text-xs text-slate-500">{menu.hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => onToggleAll(permissions, !allSelected)}
          className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {allSelected ? 'Clear' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {permissions.map((permission) => (
          <label key={permission.id} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={selected.has(permission.id)} onChange={() => onToggle(permission.id)} />
            {actionLabel(permission)}
          </label>
        ))}
      </div>
    </div>
  )
}

// Create and edit share one modal: both need the same grouped permission
// picker, which is far too much for ResourceForm's flat field list. Pass a
// `role` to edit it, omit it to create a new one.
export function RoleFormModal({ role, onClose, onSaved }) {
  const isEdit = Boolean(role)
  const [selected, setSelected] = useState(() => new Set((role?.permissions ?? []).map((p) => p.id)))
  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm({
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      scoped_section: role?.scoped_section ?? '',
    },
  })

  const permissionsQuery = useQuery({
    queryKey: ['permissions', 'all'],
    queryFn: () => permissionService.list({ page_size: 100, sort_by: 'module', sort_order: 'asc' }),
  })
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })
  const designationsQuery = useQuery({ queryKey: ['roles', 'designations'], queryFn: roleService.designations })

  // The editor offers the modules the app actually surfaces; the endpoint
  // decides which those are (OFFERED_MODULES on the backend). Anything else a
  // role already carries stays in `selected` and is saved back untouched -
  // hiding a permission must never be a way of silently revoking it - so the
  // count below says how many are riding along unseen.
  const visibleIds = useMemo(
    () => new Set((permissionsQuery.data?.items ?? []).map((permission) => permission.id)),
    [permissionsQuery.data],
  )
  const hiddenCount = [...selected].filter((id) => !visibleIds.has(id)).length

  const groups = useMemo(() => groupPermissions(permissionsQuery.data?.items ?? []), [permissionsQuery.data])

  // Each designation's codes as the ids this picker ticks.
  const designations = useMemo(() => {
    const idByCode = Object.fromEntries((permissionsQuery.data?.items ?? []).map((p) => [p.code, p.id]))
    return (designationsQuery.data ?? []).map((designation) => ({
      ...designation,
      ids: new Set(designation.permission_codes.map((code) => idByCode[code]).filter(Boolean)),
    }))
  }, [designationsQuery.data, permissionsQuery.data])

  // Which designation this role is, read off what is ticked rather than held
  // as a choice of its own: tick one box more and it is honestly Custom, and a
  // role opened for editing shows its designation without anybody saying so.
  const designation = designations.find(
    (item) => item.ids.size === selected.size && [...item.ids].every((id) => selected.has(id)),
  )
  const scopedSection = watch('scoped_section')
  const needsSection = Boolean(designation?.section_scoped && !scopedSection)

  function applyDesignation(key) {
    const chosen = designations.find((item) => item.key === key)
    // Custom leaves the boxes as they are, to be adjusted by hand.
    if (!chosen) return
    // Exactly the designation's permissions - that is what aligning a role
    // with its designation means - so anything else ticked is cleared.
    setSelected(new Set(chosen.ids))
    if (!getValues('name').trim()) setValue('name', chosen.name, { shouldValidate: true })
    if (!getValues('description').trim()) setValue('description', chosen.description)
    // Only a Section Admin is restricted to a section; the others see every
    // section's students.
    if (!chosen.section_scoped) setValue('scoped_section', '')
  }

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(permissions, select) {
    setSelected((current) => {
      const next = new Set(current)
      for (const permission of permissions) {
        if (select) next.add(permission.id)
        else next.delete(permission.id)
      }
      return next
    })
  }

  const saveMutation = useMutation({
    mutationFn: (values) => {
      // RoleUpdate is applied with exclude_unset, so clearing a field means
      // sending an explicit null - `undefined` would drop it from the payload
      // and leave the old value in place.
      const empty = isEdit ? null : undefined
      const payload = {
        name: values.name,
        description: values.description || empty,
        permission_ids: [...selected],
        scoped_section: values.scoped_section || empty,
      }
      return isEdit ? roleService.update(role.id, payload) : roleService.create(payload)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const isLoading = permissionsQuery.isLoading || configQuery.isLoading || designationsQuery.isLoading

  return (
    <Modal title={isEdit ? `Edit ${role.name}` : 'New Role'} isOpen onClose={onClose} maxWidth="max-w-2xl">
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            if (!needsSection) saveMutation.mutate(values)
          })}
        >
          <ErrorMessage message={saveMutation.error ? getApiErrorMessage(saveMutation.error) : null} />

          <div>
            <Select
              label="Designation"
              value={designation?.key ?? ''}
              onChange={(event) => applyDesignation(event.target.value)}
            >
              <option value="">Custom - choose permissions below</option>
              {designations.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              {designation
                ? designation.description
                : 'Pick a designation to tick exactly its permissions, or tick them yourself.'}
            </p>
          </div>

          <Input
            label="Role Name"
            required
            error={errors.name?.message}
            {...register('name', { required: 'Role name is required' })}
          />
          <Textarea label="Description" {...register('description')} />

          <Select
            label={designation?.section_scoped ? 'Section' : 'Restrict to a Section (optional)'}
            required={designation?.section_scoped}
            error={needsSection ? 'A Section Admin works one section - choose which.' : undefined}
            {...register('scoped_section')}
          >
            <option value="">No restriction - sees every section</option>
            {(configQuery.data?.sections ?? []).map((section) => (
              <option key={section.code} value={section.code}>
                {section.label}
              </option>
            ))}
          </Select>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Permissions <span className="font-normal text-slate-400">({selected.size} selected)</span>
            </p>
            {hiddenCount > 0 && (
              <p className="mb-2 text-xs text-slate-500">
                {hiddenCount} further permission{hiddenCount === 1 ? '' : 's'} on this role belong to modules
                the app doesn't currently link to. They are kept as they are.
              </p>
            )}
            {/* Grouped under the sidebar's own headings, so the list reads
                like the menus the role will end up seeing. */}
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {groups.map(([group, menus]) => (
                <section key={group} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                  {menus.map(([menu, permissions]) => (
                    <PermissionGroup
                      key={menu.module}
                      menu={menu}
                      permissions={permissions}
                      selected={selected}
                      onToggle={toggle}
                      onToggleAll={toggleAll}
                    />
                  ))}
                </section>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Role'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export function AddRoleAction({ onCreated }) {
  const { hasPermission } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!hasPermission(PERMISSIONS.ROLES_CREATE)) return null

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Add Role
      </Button>
      {isOpen && <RoleFormModal onClose={() => setIsOpen(false)} onSaved={onCreated} />}
    </>
  )
}
