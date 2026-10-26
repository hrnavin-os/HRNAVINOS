import axios from 'axios'
import { apiClient } from '@/services/apiClient'
import { API_BASE_URL } from '@/constants/config'

// The Student Portal - the staff's board for enrolled batches. Students never
// call any of this; their side is studentLinkService below.
export const studentPortalService = {
  batches: async () => {
    const { data } = await apiClient.get('/student-portal/batches')
    return data
  },
  roster: async (batchId) => {
    const { data } = await apiClient.get(`/student-portal/batches/${batchId}`)
    return data
  },
  // A Blob, not a URL: the report needs the bearer token, which a plain link
  // to the endpoint wouldn't carry.
  attendancePdf: async (batchId) => {
    const response = await apiClient.get(`/student-portal/batches/${batchId}/attendance.pdf`, {
      responseType: 'blob',
    })
    const disposition = response.headers['content-disposition'] ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'attendance.pdf'
    return { blob: response.data, filename }
  },

  createSession: async (batchId, payload) => {
    const { data } = await apiClient.post(`/student-portal/batches/${batchId}/sessions`, payload)
    return data
  },
  updateSession: async (sessionId, payload) => {
    const { data } = await apiClient.put(`/student-portal/sessions/${sessionId}`, payload)
    return data
  },
  deleteSession: async (sessionId) => {
    const { data } = await apiClient.delete(`/student-portal/sessions/${sessionId}`)
    return data
  },
  syncSession: async (sessionId) => {
    const { data } = await apiClient.post(`/student-portal/sessions/${sessionId}/sync`)
    return data
  },
  sessionRoster: async (sessionId) => {
    const { data } = await apiClient.get(`/student-portal/sessions/${sessionId}`)
    return data
  },
  // `attended` is true, false, or null to hand the answer back to the sync.
  setAttendance: async (sessionId, studentId, attended) => {
    const { data } = await apiClient.put(`/student-portal/sessions/${sessionId}/students/${studentId}/attendance`, {
      attended,
    })
    return data
  },
  addCallRemark: async (sessionId, studentId, remark) => {
    const { data } = await apiClient.post(`/student-portal/sessions/${sessionId}/students/${studentId}/remarks`, {
      remark,
    })
    return data
  },

  student: async (studentId) => {
    const { data } = await apiClient.get(`/student-portal/students/${studentId}`)
    return data
  },
  issueLink: async (studentId, { regenerate = false } = {}) => {
    const { data } = await apiClient.post(`/student-portal/students/${studentId}/link`, null, {
      params: { regenerate },
    })
    return data
  },
  recordTerms: async (studentId, { signedName, file }) => {
    const form = new FormData()
    form.append('signed_name', signedName)
    if (file) form.append('file', file)
    const { data } = await apiClient.post(`/student-portal/students/${studentId}/terms`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  clearTerms: async (studentId) => {
    const { data } = await apiClient.delete(`/student-portal/students/${studentId}/terms`)
    return data
  },
}

// The student's private link. Plain axios rather than apiClient: nobody is
// logged in on that page, and apiClient's 401 handling would bounce a student
// to the staff login screen.
const publicClient = axios.create({ baseURL: `${API_BASE_URL}/public/student-portal` })

export const studentLinkService = {
  get: async (token) => {
    const { data } = await publicClient.get(`/${token}`)
    return data
  },
  acceptTerms: async (token, { signedName, agreed, file }) => {
    const form = new FormData()
    form.append('signed_name', signedName)
    form.append('agreed', agreed ? 'true' : 'false')
    if (file) form.append('file', file)
    const { data } = await publicClient.post(`/${token}/terms`, form)
    return data
  },
  openRecording: async (token, sessionId) => {
    const { data } = await publicClient.post(`/${token}/classes/${sessionId}/recording`)
    return data.url
  },
}
