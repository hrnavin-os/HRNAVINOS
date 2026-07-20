import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { paymentService } from '@/services/paymentService'
import { studentService } from '@/services/studentService'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency, titleCase } from '@/utils/formatters'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const STATUS_TONES = { pending: 'amber', verified: 'green', rejected: 'red' }

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
]

function VerifyActions({ payment }) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (approve) => paymentService.verify(payment.id, approve),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  })

  if (payment.status !== 'pending' || !hasPermission(PERMISSIONS.PAYMENTS_VERIFY)) return null

  return (
    <div className="flex gap-2">
      <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => mutation.mutate(true)} disabled={mutation.isPending}>
        Verify
      </Button>
      <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => mutation.mutate(false)} disabled={mutation.isPending}>
        Reject
      </Button>
    </div>
  )
}

const columns = [
  { key: 'amount', header: 'Amount', render: (row) => formatCurrency(row.amount) },
  { key: 'method', header: 'Method', render: (row) => titleCase(row.method) },
  { key: 'payment_date', header: 'Date', render: (row) => row.payment_date },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONES[row.status] ?? 'slate'}>{titleCase(row.status)}</Badge>,
  },
  { key: 'actions', header: '', render: (row) => <VerifyActions payment={row} /> },
]

export function PaymentsPage() {
  const { data: students, isLoading } = useQuery({
    queryKey: ['students-options'],
    queryFn: () => studentService.list({ page_size: 100 }),
  })

  if (isLoading) return <LoadingSpinner />

  const createFields = [
    {
      name: 'student_id',
      label: 'Student',
      type: 'select',
      required: true,
      options: (students?.items ?? []).map((student) => ({
        value: student.id,
        label: `${student.first_name} ${student.last_name}`,
      })),
    },
    { name: 'amount', label: 'Amount', type: 'number', required: true },
    { name: 'payment_date', label: 'Payment Date', type: 'date', required: true },
    { name: 'method', label: 'Method', type: 'select', required: true, options: METHOD_OPTIONS },
    { name: 'reference_number', label: 'Reference Number' },
  ]

  return (
    <ResourceListPage
      title="Payments"
      description="Student payments awaiting or completed finance verification."
      queryKey="payments"
      service={paymentService}
      columns={columns}
      createFields={createFields}
      createPermission={PERMISSIONS.PAYMENTS_CREATE}
      transformCreatePayload={(values) => ({ ...values, amount: String(values.amount) })}
    />
  )
}
