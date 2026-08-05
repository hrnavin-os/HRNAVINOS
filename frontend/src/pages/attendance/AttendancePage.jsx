import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { batchService } from '@/services/batchService'
import { studentService } from '@/services/studentService'
import { apiClient, getApiErrorMessage } from '@/services/apiClient'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

const STATUS_OPTIONS = ['present', 'absent', 'late', 'excused']

export function AttendancePage() {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const [batchId, setBatchId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [statuses, setStatuses] = useState({})

  const { data: batches, isLoading: loadingBatches } = useQuery({
    queryKey: ['batches-options'],
    queryFn: () => batchService.list({ page_size: 100 }),
  })

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['attendance-students', batchId],
    queryFn: () => studentService.list({ batch_id: batchId, page_size: 100 }),
    enabled: Boolean(batchId),
  })

  const { data: existing } = useQuery({
    queryKey: ['attendance-existing', batchId, date],
    queryFn: async () => (await apiClient.get(`/attendance/batch/${batchId}/date/${date}`)).data,
    enabled: Boolean(batchId && date),
  })

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/attendance/mark', {
        batch_id: batchId,
        date,
        entries: (students?.items ?? []).map((student) => ({
          student_id: student.id,
          status: statuses[student.id] ?? existingStatus(student.id) ?? 'present',
        })),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance-existing'] }),
  })

  function existingStatus(studentId) {
    return existing?.find((record) => record.student_id === studentId)?.status
  }

  if (loadingBatches) return <LoadingSpinner />
  if (!hasPermission(PERMISSIONS.ATTENDANCE_MARK) && !hasPermission(PERMISSIONS.ATTENDANCE_VIEW)) {
    return <ErrorMessage message="You do not have permission to view attendance." />
  }

  return (
    <div>
      <div className="mb-6 grid max-w-lg grid-cols-2 gap-4">
        <Select label="Batch" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
          <option value="">Select batch</option>
          {(batches?.items ?? []).map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>

      {batchId && loadingStudents && <LoadingSpinner />}

      {batchId && students?.items?.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.items.map((student) => (
                <tr key={student.id}>
                  <td className="px-4 py-3 text-sm text-slate-700">{student.first_name} {student.last_name}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={statuses[student.id] ?? existingStatus(student.id) ?? 'present'}
                      onChange={(event) => setStatuses((prev) => ({ ...prev, [student.id]: event.target.value }))}
                      disabled={!hasPermission(PERMISSIONS.ATTENDANCE_MARK)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasPermission(PERMISSIONS.ATTENDANCE_MARK) && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <ErrorMessage message={submitMutation.error ? getApiErrorMessage(submitMutation.error) : null} />
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? 'Saving…' : 'Save Attendance'}
              </Button>
            </div>
          )}
        </div>
      )}

      {batchId && students && students.items.length === 0 && (
        <p className="text-sm text-slate-500">No students are enrolled in this batch.</p>
      )}
    </div>
  )
}
