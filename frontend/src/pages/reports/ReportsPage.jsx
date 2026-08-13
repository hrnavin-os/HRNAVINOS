import { useQuery } from '@tanstack/react-query'
import { reportService } from '@/services/reportService'
import { DataTable } from '@/components/ui/DataTable'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { getApiErrorMessage } from '@/services/apiClient'

// One report. The card and the table are the shared ones every other board
// uses - this page used to hand-roll a bare <table> with plain grey headings,
// so the four reports were the only tables in the ERP without the tinted
// sticky header, the skeleton rows or the empty state.
//
// The panel keeps its own titled header because four tables stacked two-up
// need naming; the DataTable inside it is stock.
function ReportSection({ title, queryKey, queryFn, columns }) {
  const { data, isLoading, error } = useQuery({ queryKey: [queryKey], queryFn })

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {/* These are short aggregate tables inside a two-up grid, so the shared
          viewport-height cap would leave them taller than their contents and
          the grid rows uneven. */}
      <div style={{ '--table-max-h': 'none' }}>
        <DataTable
          columns={columns}
          rows={data}
          isLoading={isLoading}
          error={error ? getApiErrorMessage(error) : null}
          emptyMessage="No data yet."
        />
      </div>
    </div>
  )
}

const REPORTS = [
  {
    title: 'Revenue by Month',
    queryKey: 'report-revenue',
    queryFn: reportService.revenue,
    columns: [
      { key: 'month', header: 'Month' },
      {
        key: 'total_collected',
        header: 'Collected',
        align: 'right',
        numeric: true,
        render: (row) => formatCurrency(row.total_collected),
      },
      { key: 'payment_count', header: 'Payments', align: 'right', numeric: true },
    ],
  },
  {
    title: 'Admissions by Course',
    queryKey: 'report-admissions',
    queryFn: reportService.admissions,
    columns: [
      { key: 'course_name', header: 'Course' },
      { key: 'admissions_count', header: 'Admissions', align: 'right', numeric: true },
      {
        key: 'total_revenue',
        header: 'Revenue',
        align: 'right',
        numeric: true,
        render: (row) => formatCurrency(row.total_revenue),
      },
    ],
  },
  {
    title: 'Attendance by Batch',
    queryKey: 'report-attendance',
    queryFn: reportService.attendance,
    columns: [
      { key: 'batch_name', header: 'Batch' },
      { key: 'total_sessions', header: 'Sessions', align: 'right', numeric: true },
      {
        key: 'attendance_rate',
        header: 'Attendance Rate',
        align: 'right',
        numeric: true,
        render: (row) => `${row.attendance_rate}%`,
      },
    ],
  },
  {
    title: 'Lead Conversion',
    queryKey: 'report-lead-conversion',
    queryFn: reportService.leadConversion,
    columns: [
      { key: 'status', header: 'Status', render: (row) => titleCase(row.status) },
      { key: 'count', header: 'Count', align: 'right', numeric: true },
    ],
  },
]

export function ReportsPage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {REPORTS.map((report) => (
        <ReportSection key={report.queryKey} {...report} />
      ))}
    </div>
  )
}
