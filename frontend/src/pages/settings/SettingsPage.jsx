import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsService } from '@/services/settingsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

export function SettingsPage() {
  const { hasPermission } = useAuth()
  const canUpdate = hasPermission(PERMISSIONS.SETTINGS_UPDATE)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const mutation = useMutation({
    mutationFn: settingsService.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated)
      reset(updated)
    },
  })

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Settings</h1>
      <p className="mb-6 text-sm text-slate-500">Institute-wide configuration.</p>

      <ErrorMessage message={error ? getApiErrorMessage(error) : null} />

      <form
        className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <ErrorMessage message={mutation.error ? getApiErrorMessage(mutation.error) : null} />
        <Input
          label="Institute Name"
          disabled={!canUpdate}
          error={errors.institute_name?.message}
          {...register('institute_name', { required: 'Institute name is required' })}
        />
        <Input label="Institute Email" type="email" disabled={!canUpdate} {...register('institute_email')} />
        <Input label="Institute Phone" disabled={!canUpdate} {...register('institute_phone')} />
        <Input label="Institute Address" disabled={!canUpdate} {...register('institute_address')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Currency" disabled={!canUpdate} {...register('currency')} />
          <Input label="Invoice Prefix" disabled={!canUpdate} {...register('invoice_prefix')} />
        </div>
        <Input label="Timezone" disabled={!canUpdate} {...register('timezone')} />

        {canUpdate && (
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
