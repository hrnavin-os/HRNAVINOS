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
import { titleCase } from '@/utils/formatters'

function PermissionGroup({ module, permissions, selected, onToggle, onToggleAll }) {
  const allSelected = permissions.every((p) => selected.has(p.id))
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titleCase(module)}</p>
        <button
          type="button"
          onClick={() => onToggleAll(permissions, !allSelected)}
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {allSelected ? 'Clear' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {permissions.map((permission) => (
          <label key={permission.id} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={selected.has(permission.id)} onChange={() => onToggle(permission.id)} />
            {permission.action}
          </label>
        ))}
      </div>
    </div>
  )
}

function AddRoleModal({ onClose, onCreated }) {
  const [selected, setSelected] = useState(new Set())
  const { register, handleSubmit, formState: { errors } } = useForm()

  const permissionsQuery = useQuery({
    queryKey: ['permissions', 'all'],
    queryFn: () => permissionService.list({ page_size: 100, sort_by: 'module', sort_order: 'asc' }),
  })
  const configQuery = useQuery({ queryKey: ['foundation-form-config'], queryFn: foundationFormConfigService.get })

  const groups = useMemo(() => {
    const items = permissionsQuery.data?.items ?? []
    const byModule = new Map()
    for (const permission of items) {
      if (!byModule.has(permission.module)) byModule.set(permission.module, [])
      byModule.get(permission.module).push(permission)
    }
    return [...byModule.entries()]
  }, [permissionsQuery.data])

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

  const createMutation = useMutation({
    mutationFn: (values) =>
      roleService.create({
        name: values.name,
        description: values.description || undefined,
        permission_ids: [...selected],
        scoped_section: values.scoped_section || undefined,
      }),
    onSuccess: () => {
      onCreated()
      onClose()
    },
  })

  const isLoading = permissionsQuery.isLoading || configQuery.isLoading

  return (
    <Modal title="New Role" isOpen onClose={onClose} maxWidth="max-w-2xl">
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
          <ErrorMessage message={createMutation.error ? getApiErrorMessage(createMutation.error) : null} />

          <Input
            label="Role Name"
            required
            error={errors.name?.message}
            {...register('name', { required: 'Role name is required' })}
          />
          <Textarea label="Description" {...register('description')} />

          <Select label="Restrict to Form Collection Section (optional)" {...register('scoped_section')}>
            <option value="">No restriction - sees every lead</option>
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
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {groups.map(([module, permissions]) => (
                <PermissionGroup
                  key={module}
                  module={module}
                  permissions={permissions}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save Role'}
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
      {isOpen && <AddRoleModal onClose={() => setIsOpen(false)} onCreated={onCreated} />}
    </>
  )
}
