import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileSpreadsheet, Link2, RefreshCw, Settings, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { googleSheetsService } from '@/services/googleSheetsService'
import { getApiErrorMessage } from '@/services/apiClient'
import { formatDateTime } from '@/utils/formatters'
import { GoogleCredentialsModal } from '@/components/marketing/GoogleCredentialsModal'

export function GoogleSheetsIntegration() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sheetUrl, setSheetUrl] = useState('')
  const [banner, setBanner] = useState(null)
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false)

  const statusQuery = useQuery({ queryKey: ['google-sheets-status'], queryFn: googleSheetsService.getStatus })

  useEffect(() => {
    const result = searchParams.get('google')
    if (!result) return
    setBanner(
      result === 'connected'
        ? { tone: 'success', message: 'Google account connected.' }
        : { tone: 'error', message: 'Google connection failed or was cancelled. Please try again.' },
    )
    queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] })
    setSearchParams((params) => {
      params.delete('google')
      return params
    })
  }, [searchParams, setSearchParams, queryClient])

  const connectMutation = useMutation({
    mutationFn: googleSheetsService.getAuthUrl,
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })

  const fetchTabsMutation = useMutation({
    mutationFn: () => googleSheetsService.fetchTabs(sheetUrl.trim()),
    onSuccess: () => {
      setSheetUrl('')
      queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] })
    },
  })

  const syncMutation = useMutation({
    mutationFn: googleSheetsService.syncNow,
    onSuccess: (data) => {
      setBanner({ tone: 'success', message: `Sync complete — ${data.leads_created} new lead(s) created.` })
      queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: googleSheetsService.disconnect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] }),
  })

  const removeSheetMutation = useMutation({
    mutationFn: (spreadsheetId) => googleSheetsService.removeSheet(spreadsheetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] }),
  })

  if (statusQuery.isLoading) return <LoadingSpinner />

  const isConnected = Boolean(statusQuery.data?.connected)
  const sheets = statusQuery.data?.sheets ?? []
  const mutationError =
    connectMutation.error || fetchTabsMutation.error || syncMutation.error || disconnectMutation.error || removeSheetMutation.error

  return (
    <div className="space-y-4">
      {banner && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            banner.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}
      <ErrorMessage message={mutationError ? getApiErrorMessage(mutationError) : null} />

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
            <FileSpreadsheet className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Google Sheets Integration</h2>
            <p className="text-sm text-slate-600">Paste a sheet URL → each tab becomes a lead source</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Connected
            </span>
          )}
          <Button variant="secondary" onClick={() => setIsCredentialsOpen(true)}>
            <Settings className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Settings
          </Button>
          {isConnected ? (
            <Button variant="danger" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
              <Unlink className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
              <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {connectMutation.isPending ? 'Redirecting…' : 'Connect with Google'}
            </Button>
          )}
        </div>
      </div>

      {isCredentialsOpen && <GoogleCredentialsModal onClose={() => setIsCredentialsOpen(false)} />}

      {isConnected && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                1
              </span>
              <h3 className="text-sm font-semibold text-slate-900">Paste Google Sheet URL</h3>
            </div>
            <p className="mt-1 pl-8 text-sm text-slate-500">Each tab in the sheet will become a separate lead source in your CRM</p>
            <div className="mt-3 flex flex-wrap gap-2 pl-8">
              <Input
                className="min-w-[280px] flex-1"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(event) => setSheetUrl(event.target.value)}
              />
              <Button onClick={() => fetchTabsMutation.mutate()} disabled={fetchTabsMutation.isPending || !sheetUrl.trim()}>
                {fetchTabsMutation.isPending ? 'Fetching…' : 'Fetch Tabs →'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Connected Sheets</h3>
                <p className="text-sm text-slate-500">New rows added to these sheets are auto-synced as leads</p>
              </div>
              {sheets.length > 0 && (
                <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} strokeWidth={2} aria-hidden="true" />
                  {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
                </Button>
              )}
            </div>

            {sheets.length > 0 ? (
              <div className="mt-4 space-y-3">
                {sheets.map((sheet) => (
                  <div key={sheet.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden="true" />
                        <span className="font-medium text-slate-900">{sheet.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">
                          {sheet.last_sync_at ? `Last sync: ${formatDateTime(sheet.last_sync_at)}` : 'Not synced yet'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSheetMutation.mutate(sheet.id)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${sheet.name}`}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sheet.tabs.map((tab) => (
                        <span key={tab.name} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {tab.name} <span className="text-slate-400">({tab.row_count} rows)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-slate-500">No sheets connected yet. Paste a URL above to get started.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
