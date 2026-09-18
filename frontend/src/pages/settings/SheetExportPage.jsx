import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Sheet,
  Table2,
} from 'lucide-react'
import { sheetExportService } from '@/services/sheetExportService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatDateTime } from '@/utils/formatters'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

const QUERY_KEY = ['sheet-export']

// While a run is in flight the panel is the only thing that says so, so it
// refreshes itself rather than waiting for the next thing the user clicks.
const POLL_WHILE_RUNNING = 4000

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

// One exported tab: which board it comes from, how many rows that board holds,
// and the headers row 1 will carry. The headers are collapsed by default -
// there are 33 of them on the Induction tab, and the point of showing them at
// all is to be able to check one, not to read the list every visit.
function TabCard({ tab }) {
  const [showHeaders, setShowHeaders] = useState(false)

  return (
    <Card>
      <CardHeader
        title={tab.label}
        description={`Written to the "${tab.tab_name}" tab`}
        actions={
          <Badge tone="slate">
            {tab.record_count} row{tab.record_count === 1 ? '' : 's'}
          </Badge>
        }
      />
      <CardBody className="space-y-3">
        {tab.stats ? (
          <p className="text-xs text-slate-500">
            Last run wrote {tab.stats.rows} row{tab.stats.rows === 1 ? '' : 's'} across {tab.stats.columns}{' '}
            columns
            {tab.stats.written ? '.' : ' — unchanged since the run before, so the tab was left alone.'}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Not exported yet.</p>
        )}

        <button
          type="button"
          onClick={() => setShowHeaders((open) => !open)}
          className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showHeaders ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          {showHeaders ? 'Hide' : 'Show'} the {tab.headers.length} column headers
        </button>

        {showHeaders && (
          <ol className="flex flex-wrap gap-1.5">
            {tab.headers.map((header, index) => (
              <li
                key={header}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
              >
                <span className="text-slate-400">{index + 1}.</span> {header}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  )
}

export function SheetExportPage() {
  const { hasPermission } = useAuth()
  const canUpdate = hasPermission(PERMISSIONS.SHEET_EXPORT_UPDATE)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: sheetExportService.get,
    refetchInterval: (query) => (query.state.data?.running ? POLL_WHILE_RUNNING : false),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm()

  useEffect(() => {
    if (data) {
      reset({
        spreadsheet_url: data.spreadsheet_url ?? '',
        induction_tab: data.induction_tab,
        foundation_tab: data.foundation_tab,
      })
    }
  }, [data, reset])

  // One mutation for every write: the endpoint takes a partial update and
  // answers with the whole status, so saving the link, flipping the switch and
  // running an export all land in the cache the same way.
  const save = useMutation({
    mutationFn: sheetExportService.update,
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
  })
  const runNow = useMutation({
    mutationFn: sheetExportService.run,
    onSuccess: (updated) => queryClient.setQueryData(QUERY_KEY, updated),
  })

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={getApiErrorMessage(error)} />

  const pending = save.isPending || runNow.isPending
  const mutationError = save.error || runNow.error

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Google Sheets export"
        description="Mirror the Induction and Foundation boards into a Google spreadsheet. The ERP writes to the sheet; the sheet never writes back."
      />

      <ErrorMessage message={mutationError ? getApiErrorMessage(mutationError) : null} />

      {/* --- the link ---------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Spreadsheet"
          description="Paste the link to the Google spreadsheet the boards should be written into."
          actions={
            data.spreadsheet_url && (
              <a
                href={data.spreadsheet_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                Open sheet
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </a>
            )
          }
        />
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={handleSubmit((values) =>
              save.mutate({
                spreadsheet_url: values.spreadsheet_url.trim(),
                induction_tab: values.induction_tab.trim(),
                foundation_tab: values.foundation_tab.trim(),
              }),
            )}
          >
            <Input
              label="Google Sheets link"
              placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              disabled={!canUpdate || pending}
              error={errors.spreadsheet_url?.message}
              {...register('spreadsheet_url')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Induction tab name"
                disabled={!canUpdate || pending}
                error={errors.induction_tab?.message}
                {...register('induction_tab', { required: 'A tab name is required' })}
              />
              <Input
                label="Foundation tab name"
                disabled={!canUpdate || pending}
                error={errors.foundation_tab?.message}
                {...register('foundation_tab', { required: 'A tab name is required' })}
              />
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              Either tab is created automatically if the spreadsheet doesn&rsquo;t have it yet. Clearing the
              link turns the export off.
              {data.service_account_email && (
                <>
                  {' '}
                  Share the spreadsheet as an <span className="font-medium">Editor</span> with{' '}
                  <span className="font-medium text-slate-700">{data.service_account_email}</span>, or Google
                  will refuse the write.
                </>
              )}
            </p>

            {canUpdate && (
              <div className="flex justify-end">
                <Button type="submit" disabled={pending || !isDirty}>
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      {/* --- on/off and last run ----------------------------------------- */}
      <Card>
        <CardHeader
          title="Export"
          description={`Runs by itself every ${Math.round(data.interval_seconds / 60)} minute${
            Math.round(data.interval_seconds / 60) === 1 ? '' : 's'
          } while it is on.`}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={data.enabled ? 'green' : 'slate'}>{data.enabled ? 'On' : 'Off'}</Badge>
              {canUpdate && (
                <Button
                  variant="secondary"
                  disabled={pending || !data.spreadsheet_id}
                  onClick={() => save.mutate({ enabled: !data.enabled })}
                >
                  {data.enabled ? 'Turn off' : 'Turn on'}
                </Button>
              )}
              {canUpdate && (
                <Button variant="secondary" disabled={pending || !data.ready} onClick={() => runNow.mutate()}>
                  <RefreshCw
                    className={`h-4 w-4 ${runNow.isPending || data.running ? 'animate-spin' : ''}`}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {runNow.isPending || data.running ? 'Exporting…' : 'Export now'}
                </Button>
              )}
            </div>
          }
        />
        <CardBody className="space-y-4">
          {data.blocked_reason && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Sheet className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {data.blocked_reason}
            </p>
          )}

          {data.last_error ? (
            <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>
                <span className="font-medium">The last export failed.</span> {data.last_error}
              </span>
            </p>
          ) : (
            data.last_success_at && (
              <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                Both tabs were written successfully at {formatDateTime(data.last_success_at)}.
              </p>
            )
          )}

          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Last successful export">{formatDateTime(data.last_success_at)}</Field>
            <Field label="Last attempt">{formatDateTime(data.last_finished_at)}</Field>
            <Field label="Next run">{data.enabled ? formatDateTime(data.next_run_at) : '—'}</Field>
            <Field label="Signed in as">{data.credential ?? '—'}</Field>
            <Field label="Spreadsheet ID">
              <span className="break-all font-mono text-xs">{data.spreadsheet_id ?? '—'}</span>
            </Field>
          </dl>
        </CardBody>
      </Card>

      {/* --- what gets written ------------------------------------------- */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Table2 className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />
          What gets written
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.tabs.map((tab) => (
            <TabCard key={tab.key} tab={tab} />
          ))}
        </div>
      </div>
    </div>
  )
}
