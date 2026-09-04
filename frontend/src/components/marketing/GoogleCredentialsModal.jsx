import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { googleSheetsService } from '@/services/googleSheetsService'
import { getApiErrorMessage } from '@/services/apiClient'

const SOURCE_LABELS = { database: 'Database', environment: 'Environment', none: 'Not configured' }

export function GoogleCredentialsModal({ onClose }) {
  const queryClient = useQueryClient()
  const credentialsQuery = useQuery({ queryKey: ['google-sheets-credentials'], queryFn: googleSheetsService.getCredentials })

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState('')

  useEffect(() => {
    if (!credentialsQuery.data) return
    setClientId(credentialsQuery.data.client_id ?? '')
    setRedirectUri(credentialsQuery.data.redirect_uri ?? '')
  }, [credentialsQuery.data])

  const saveMutation = useMutation({
    mutationFn: () =>
      googleSheetsService.updateCredentials({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim() || undefined,
        redirect_uri: redirectUri.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-sheets-credentials'] })
      queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] })
      onClose()
    },
  })

  return (
    <Modal title="Google Sheets Credentials" isOpen onClose={onClose}>
      {credentialsQuery.isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            These come from a Google Cloud OAuth Client (Web application). Saved here, they're stored in the database and used
            immediately — no server restart needed.
          </p>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Currently active from: <span className="font-semibold text-slate-800">{SOURCE_LABELS[credentialsQuery.data?.source] ?? 'Not configured'}</span>
          </span>

          <ErrorMessage message={saveMutation.error ? getApiErrorMessage(saveMutation.error) : null} />

          <Input label="Client ID" value={clientId} onChange={(event) => setClientId(event.target.value)} />

          <PasswordInput
            label="Client Secret"
            placeholder="leave blank to keep the saved one"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
          />

          <div>
            <Input label="Redirect URI" value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Must exactly match an Authorized redirect URI on the Google Cloud OAuth Client.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !clientId.trim() || !redirectUri.trim()}
            >
              <Settings className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {saveMutation.isPending ? 'Saving…' : 'Save Credentials'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
