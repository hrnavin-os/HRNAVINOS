import { useQuery } from '@tanstack/react-query'
import { reportService } from '@/services/reportService'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { getApiErrorMessage } from '@/services/apiClient'

function ReportSection({ title, queryKey, queryFn, renderRow, headers }) {
  const { data, isLoading, error } = useQuery({ queryKey: [queryKey], queryFn })

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="p-4">
        {isLoading && <LoadingSpinner />}
        {error && <ErrorMessage message={getApiErrorMessage(error)} />}
        {data && data.length === 0 && <p className="text-sm text-slate-500">No data yet.</p>}
        {data && data.length > 0 && (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header} className="py-1.5 text-left font-medium text-slate-500">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, index) => (
                <tr key={index}>{renderRow(row)}</tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function ReportsPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Reports</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReportSection
          title="Revenue by Month"
          queryKey="report-revenue"
          queryFn={reportService.revenue}
          headers={['Month', 'Collected', 'Payments']}
          renderRow={(row) => (
            <>
              <td className="py-1.5">{row.month}</td>
              <td className="py-1.5">{formatCurrency(row.total_collected)}</td>
              <td className="py-1.5">{row.payment_count}</td>
            </>
          )}
        />
        <ReportSection
          title="Admissions by Course"
          queryKey="report-admissions"
          queryFn={reportService.admissions}
          headers={['Course', 'Admissions', 'Revenue']}
          renderRow={(row) => (
            <>
              <td className="py-1.5">{row.course_name}</td>
              <td className="py-1.5">{row.admissions_count}</td>
              <td className="py-1.5">{formatCurrency(row.total_revenue)}</td>
            </>
          )}
        />
        <ReportSection
          title="Attendance by Batch"
          queryKey="report-attendance"
          queryFn={reportService.attendance}
          headers={['Batch', 'Sessions', 'Attendance Rate']}
          renderRow={(row) => (
            <>
              <td className="py-1.5">{row.batch_name}</td>
              <td className="py-1.5">{row.total_sessions}</td>
              <td className="py-1.5">{row.attendance_rate}%</td>
            </>
          )}
        />
        <ReportSection
          title="Lead Conversion"
          queryKey="report-lead-conversion"
          queryFn={reportService.leadConversion}
          headers={['Status', 'Count']}
          renderRow={(row) => (
            <>
              <td className="py-1.5">{titleCase(row.status)}</td>
              <td className="py-1.5">{row.count}</td>
            </>
          )}
        />
      </div>
    </div>
  )
}
