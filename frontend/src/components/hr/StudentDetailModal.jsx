import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/utils/formatters'

// Read-only detail behind the eye icon. Renders straight from the table row
// rather than refetching: the queue and allocation endpoints already return
// every field shown here.
function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="col-span-2 text-sm break-words text-slate-900">{children ?? '—'}</dd>
    </div>
  )
}

export function StudentDetailModal({ record, onClose }) {
  const paid = record.fully_paid
  const hasPlan = Boolean(record.total_installments)

  return (
    <Modal title={record.name} isOpen onClose={onClose}>
      <dl className="divide-y divide-slate-100">
        <Row label="Name">{record.name}</Row>
        <Row label="Phone">{record.phone}</Row>
        <Row label="Email">{record.email}</Row>
        <Row label="Course">{record.course_interest}</Row>
        <Row label="Section">
          {record.section ? <Badge tone="violet">{record.section.toUpperCase()}</Badge> : null}
        </Row>
        <Row label="Payment">
          <Badge tone={paid ? 'green' : 'amber'}>
            {paid ? 'Fees cleared' : hasPlan ? `${record.paid_installments}/${record.total_installments} paid` : 'Unpaid'}
          </Badge>
        </Row>
        {hasPlan && (
          <Row label="Instalments">
            {record.paid_installments} of {record.total_installments} collected
          </Row>
        )}
        {record.batch_name && <Row label="Batch">{record.batch_name}</Row>}
        {record.status && (
          <Row label="Seat status">
            <Badge tone={record.status === 'confirmed' ? 'blue' : 'amber'}>{record.status}</Badge>
          </Row>
        )}
        {'hr_marked' in record && (
          <Row label="Marked">
            {record.hr_marked ? <Badge tone="green">Marked</Badge> : <span className="text-slate-400">Not marked</span>}
          </Row>
        )}
        <Row label="Added">{formatDate(record.created_at ?? record.allocated_at)}</Row>
        {record.confirmed_at && <Row label="Enrolled">{formatDate(record.confirmed_at)}</Row>}
      </dl>
    </Modal>
  )
}
