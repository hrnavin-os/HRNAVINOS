import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Search, UserX, XCircle } from 'lucide-react'
import { batchConfirmationService } from '@/services/batchConfirmationService'
import { getApiErrorMessage } from '@/services/apiClient'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { DataTable } from '@/components/ui/DataTable'
import { TableCard } from '@/components/ui/TableCard'
import { TabStrip } from '@/components/ui/TabStrip'
import { HRStudentDetailModal } from '@/components/hr/HRStudentDetailModal'
import { WhatsAppOnboardingBoard } from '@/pages/hr/WhatsAppOnboardingBoard'
import { formatDate } from '@/utils/formatters'

// Two views, not the old four tabs. "Approved by Finance" and "Group Assigned"
// were the same population split by a single timestamp, and that timestamp is
// now one of four onboarding states - so they collapse into the onboarding
// board, which shows all of them and says which is which. Lost is genuinely
// separate: those candidates have left the pipeline entirely.
const TABS = [
  { key: 'onboarding', label: 'Group Onboarding', icon: MessageCircle },
  { key: 'lost', label: 'Lost Students', icon: UserX },
]

const dash = (value) => value ?? <span className="text-slate-400">—</span>

function LostStudents() {
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null)

  const query = useQuery({
    queryKey: ['batch-confirmation', 'students', 'lost'],
    queryFn: () => batchConfirmationService.hrStudents('lost'),
  })
  const linksQuery = useQuery({ queryKey: ['whatsapp-links'], queryFn: batchConfirmationService.whatsappLinks })
  const linkBySection = Object.fromEntries(
    (linksQuery.data ?? []).map((section) => [section.code, section]),
  )

  const columns = [
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.name}</p>
          <p className="truncate text-xs text-slate-500">{row.phone}</p>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (row) => dash(row.email) },
    { key: 'course_interest', header: 'Course', render: (row) => dash(row.course_interest) },
    {
      key: 'section',
      header: 'Section',
      align: 'center',
      render: (row) => (row.section ? <Badge tone="violet">{row.section.toUpperCase()}</Badge> : dash(null)),
    },
    {
      key: 'batch',
      header: 'Batch',
      align: 'center',
      render: (row) => (row.batch ? <Badge tone="blue">{row.batch}</Badge> : dash(null)),
    },
    { key: 'lost_reason', header: 'Lost Reason', render: (row) => dash(row.lost_reason) },
    { key: 'lost_at', header: 'Lost Date', align: 'center', render: (row) => formatDate(row.lost_at) },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: () => (
        <Badge tone="red">
          <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          Lost
        </Badge>
      ),
    },
  ]

  const term = search.trim().toLowerCase()
  const allRows = query.data ?? []
  const rows = term
    ? allRows.filter((row) =>
        [row.name, row.phone, row.email, row.course_interest, row.batch]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term)),
      )
    : allRows

  return (
    <div>
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="relative min-w-55 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <TableCard>
        <DataTable
          columns={columns}
          rows={rows}
          isLoading={query.isLoading}
          error={query.error ? getApiErrorMessage(query.error) : null}
          emptyMessage="No students have been marked Lost."
          onRowClick={(row) => setViewing(row)}
        />
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-600">{rows.length}</span> of {allRows.length}
        </p>
      </TableCard>

      {viewing && (
        <HRStudentDetailModal
          student={viewing}
          sectionLabel={viewing.section ? linkBySection[viewing.section]?.label : null}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

export function HRCoordinatorPage() {
  const [tab, setTab] = useState('onboarding')

  return (
    <div>
      <TabStrip tabs={TABS} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'onboarding' ? <WhatsAppOnboardingBoard /> : <LostStudents />}
    </div>
  )
}
