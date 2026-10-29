import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileSpreadsheet, MessageSquarePlus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AttendanceControl, RemarkThread } from '@/components/studentPortal/AttendanceControls'
import { PercentBadge } from '@/components/studentPortal/AttendanceBadge'
import { studentPortalService } from '@/services/studentPortalService'
import { getApiErrorMessage } from '@/services/apiClient'
import { usePortalRefresh } from '@/hooks/usePortalRefresh'
import { formatDate } from '@/utils/formatters'

// The remarks the attendance sheet was written with, offered as one tap.
const REMARK_SUGGESTIONS = ['went out', 'DNP', 'Network issue', 'Unwell', 'Will watch the recording']

const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

function CheckBox({ value, marked, disabled, label, onToggle }) {
  // Ticked green, as the sheet's boxes were; an empty box with an amber edge
  // for "not there"; dashed for a check nothing can answer yet.
  const look =
    value === true
      ? 'border-emerald-500 bg-emerald-500 text-white'
      : value === false
        ? 'border-amber-400 bg-white'
        : 'border-dashed border-slate-300 bg-white'
  const source = value === null ? 'Not taken yet' : marked ? 'Ticked by staff' : 'From Google Meet'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={`${label} · ${source}`}
      aria-label={`${label}: ${value === true ? 'ticked' : 'not ticked'} (${source})`}
      aria-pressed={value === true}
      className={`relative inline-flex h-5 w-5 items-center justify-center rounded border transition-colors enabled:hover:ring-2 enabled:hover:ring-brand-200 disabled:cursor-default ${look}`}
    >
      {value === true && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
      {/* A staff tick is marked as one, so it reads apart from what Meet said. */}
      {marked && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-violet-500 ring-1 ring-white" />}
    </button>
  )
}

function RemarkModal({ target, canMark, onClose }) {
  const refresh = usePortalRefresh()
  const { row, session, cell } = target
  return (
    <Modal
      title={`${row.name} · Class ${session.sequence}`}
      isOpen
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          {session.title} · {formatDate(session.held_on)}
          {session.start_time && ` · ${session.start_time}${session.end_time ? `-${session.end_time}` : ''}`}
        </p>
        {cell.note && <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">{cell.note}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-700">Attendance for this class</p>
          <AttendanceControl
            sessionId={session.id}
            studentId={row.student_id}
            override={cell.override}
            disabled={!canMark}
            onChanged={refresh}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-slate-700">Remarks</p>
          <RemarkThread
            sessionId={session.id}
            studentId={row.student_id}
            remarks={cell.call_remarks}
            canAdd={canMark}
            onAdded={refresh}
            suggestions={REMARK_SUGGESTIONS}
          />
        </div>
      </div>
    </Modal>
  )
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// The register as the Google Sheet it replaces, for anyone who still wants the
// file: a line per student, then H, C and Remarks for every class.
function downloadCsv(data, rows) {
  const tick = (value) => (value === true ? '✓' : value === false ? '✗' : '')
  const header = ['S.No', 'Batch', 'Name', 'Phone', 'Email']
  for (const session of data.sessions) {
    const day = `Class ${session.sequence} (${session.held_on})`
    header.push(`${day} H`, `${day} C`, `${day} Remarks`)
  }
  header.push('Attended', 'Held', 'Attendance %')
  const lines = [header]
  rows.forEach((row, index) => {
    const line = [index + 1, row.code, row.name, row.phone, row.email]
    row.cells.forEach((cell) => {
      line.push(tick(cell.start), tick(cell.end), cell.call_remarks.at(-1)?.remark ?? cell.note ?? '')
    })
    line.push(row.totals.attended, row.totals.held, row.totals.percent ?? '')
    lines.push(line)
  })
  // The byte-order mark is what makes Excel read the ticks as UTF-8.
  const blob = new Blob([`﻿${lines.map((line) => line.map(csvCell).join(',')).join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `attendance-register-${data.batch_name.replace(/[^A-Za-z0-9]+/g, '-')}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * The attendance register: the batch laid out as the attendance sheet was. A
 * line per student and, for every class, the start check (H), the end check
 * (C) and the remarks.
 *
 * The checks fill themselves from Google Meet - joined by ten past the start,
 * still there ten minutes before the end - and a member of staff can tick or
 * untick either, which is how a class is taken while Meet isn't being read.
 * A tick counts the student present for the class.
 */
export function AttendanceRegister({ batchId, canMark }) {
  const queryClient = useQueryClient()
  const refresh = usePortalRefresh()
  const [search, setSearch] = useState('')
  const [section, setSection] = useState('')
  const [showDropped, setShowDropped] = useState(false)
  const [target, setTarget] = useState(null)
  const queryKey = ['portal-register', batchId]

  const query = useQuery({ queryKey, queryFn: () => studentPortalService.register(batchId) })

  const toggle = useMutation({
    mutationFn: ({ sessionId, studentId, checks }) => studentPortalService.setChecks(sessionId, studentId, checks),
    // Ticked on screen at once, as a sheet's box is; the refetch afterwards
    // brings the totals and notes into line.
    onMutate: ({ sessionId, studentId, checks }) => {
      queryClient.setQueryData(queryKey, (current) =>
        current && {
          ...current,
          rows: current.rows.map((row) =>
            row.student_id !== studentId
              ? row
              : {
                  ...row,
                  cells: row.cells.map((cell) =>
                    cell.session_id !== sessionId
                      ? cell
                      : {
                          ...cell,
                          ...Object.fromEntries(
                            Object.entries(checks).flatMap(([key, value]) => [
                              [key, value],
                              [`${key}_marked`, true],
                            ]),
                          ),
                        },
                  ),
                },
          ),
        },
      )
    },
    onSettled: refresh,
  })

  const data = query.data
  const sections = useMemo(
    () => [...new Set((data?.rows ?? []).map((row) => row.section).filter(Boolean))].sort(),
    [data],
  )
  const droppedCount = (data?.rows ?? []).filter((row) => row.status === 'dropped').length
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter(
      (row) =>
        (showDropped || row.status !== 'dropped') &&
        (!section || row.section === section) &&
        (!needle ||
          row.name.toLowerCase().includes(needle) ||
          (row.email ?? '').toLowerCase().includes(needle) ||
          (row.phone ?? '').includes(needle)),
    )
  }, [data, search, section, showDropped])

  if (query.isLoading) return <LoadingSpinner />
  if (query.isError) return <ErrorMessage message={getApiErrorMessage(query.error)} />

  if (!data.sessions.length) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        No classes yet. Add one under Classes and its column appears here.
      </Card>
    )
  }

  const pill = (active) =>
    `h-7 rounded-full px-3 text-xs font-medium transition-colors ${
      active ? 'bg-brand-600 text-white' : 'text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
    }`

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search name, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            rightElement={<Search className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden="true" />}
          />
        </div>
        {sections.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Section">
            <button type="button" className={pill(!section)} onClick={() => setSection('')}>
              All sections
            </button>
            {sections.map((code) => (
              <button key={code} type="button" className={pill(section === code)} onClick={() => setSection(code)}>
                Section {code}
              </button>
            ))}
          </div>
        )}
        {droppedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showDropped} onChange={(event) => setShowDropped(event.target.checked)} />
            Show dropped ({droppedCount})
          </label>
        )}
        <Button variant="secondary" className="ml-auto" onClick={() => downloadCsv(data, rows)}>
          <FileSpreadsheet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Download sheet
        </Button>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        <span>
          <span className="font-semibold text-slate-700">H</span> there at the start ·{' '}
          <span className="font-semibold text-slate-700">C</span> still there at the close
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> ticked by staff, the rest from Google
          Meet
        </span>
        {canMark && <span>Click a box to tick or untick it, and a remark cell to log a call.</span>}
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 w-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center font-semibold">
                #
              </th>
              <th rowSpan={2} className="sticky left-10 z-20 min-w-52 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">
                Student
              </th>
              <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2 text-left font-semibold">
                Attendance
              </th>
              {data.sessions.map((session) => {
                const day = new Date(`${session.held_on}T00:00:00`)
                return (
                  <th
                    key={session.id}
                    colSpan={3}
                    title={session.title}
                    className={`border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold ${
                      session.held ? '' : 'text-slate-400'
                    }`}
                  >
                    <span className="block">
                      {weekday.format(day)} {dayMonth.format(day)}
                    </span>
                    <span className="block text-[10px] font-normal">
                      Class {session.sequence}
                      {!session.held && ' · upcoming'}
                    </span>
                  </th>
                )
              })}
            </tr>
            <tr>
              {data.sessions.map((session) => (
                <SubHeaders key={session.id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.student_id} className={`group ${row.status === 'dropped' ? 'opacity-50' : ''}`}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-2 py-1.5 text-center tabular-nums text-slate-500 group-hover:bg-slate-50">
                  {index + 1}
                </td>
                <td className="sticky left-10 z-10 border-b border-r border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50">
                  <p className="font-medium text-slate-900">{row.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {[row.code, row.phone].filter(Boolean).join(' · ')}
                    {row.status === 'dropped' && ' · dropped'}
                  </p>
                </td>
                <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-1.5">
                  {row.totals.held ? (
                    <span className="inline-flex items-center gap-1.5">
                      <PercentBadge percent={row.totals.percent} />
                      <span className="tabular-nums text-slate-500">
                        {row.totals.attended}/{row.totals.held}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                {row.cells.map((cell, cellIndex) => {
                  const session = data.sessions[cellIndex]
                  const editable = canMark && session.held && row.status !== 'dropped'
                  const remark = cell.call_remarks.at(-1)?.remark
                  const setCheck = (key) =>
                    toggle.mutate({
                      sessionId: session.id,
                      studentId: row.student_id,
                      checks: { [key]: cell[key] !== true },
                    })
                  return (
                    <RegisterCells
                      key={cell.session_id}
                      cell={cell}
                      remark={remark}
                      editable={editable}
                      held={session.held}
                      onStart={() => setCheck('start')}
                      onEnd={() => setCheck('end')}
                      onRemark={() => setTarget({ row, session, cell })}
                    />
                  )
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3 + data.sessions.length * 3} className="px-4 py-8 text-center text-sm text-slate-500">
                  No student matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ErrorMessage message={toggle.error && getApiErrorMessage(toggle.error)} />

      {target && <RemarkModal target={target} canMark={canMark} onClose={() => setTarget(null)} />}
    </Card>
  )
}

function SubHeaders() {
  return (
    <>
      <th className="w-9 border-b border-slate-200 px-1 py-1 text-center font-semibold" title="There at the start">
        H
      </th>
      <th className="w-9 border-b border-slate-200 px-1 py-1 text-center font-semibold" title="Still there at the close">
        C
      </th>
      <th className="min-w-28 border-b border-r border-slate-200 px-2 py-1 text-left font-semibold">Remarks</th>
    </>
  )
}

function RegisterCells({ cell, remark, editable, held, onStart, onEnd, onRemark }) {
  return (
    <>
      <td className="border-b border-slate-100 px-1 py-1.5 text-center">
        <CheckBox value={cell.start} marked={cell.start_marked} disabled={!editable} label="Start (H)" onToggle={onStart} />
      </td>
      <td className="border-b border-slate-100 px-1 py-1.5 text-center">
        <CheckBox value={cell.end} marked={cell.end_marked} disabled={!editable} label="Close (C)" onToggle={onEnd} />
      </td>
      <td className="border-b border-r border-slate-100 px-1 py-1">
        {held ? (
          <button
            type="button"
            onClick={onRemark}
            title={remark ?? cell.note ?? 'Log a call'}
            className="group/remark flex w-full max-w-40 items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-slate-100"
          >
            {remark ? (
              <span className="truncate text-slate-800">{remark}</span>
            ) : cell.note ? (
              <span className="truncate italic text-slate-400">{cell.note}</span>
            ) : (
              <MessageSquarePlus
                className="h-3.5 w-3.5 text-slate-300 group-hover/remark:text-slate-500"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </button>
        ) : null}
      </td>
    </>
  )
}
