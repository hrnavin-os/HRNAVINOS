import axios from 'axios'
import { API_BASE_URL } from '@/constants/config'
import { tokenStorage } from '@/utils/tokenStorage'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise = null

async function refreshAccessToken() {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) throw new Error('No refresh token available')

  const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
  tokenStorage.setTokens(response.data)
  return response.data.access_token
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status
    const isAuthRoute = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh')

    if (status === 401 && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true
      try {
        refreshPromise = refreshPromise || refreshAccessToken()
        const newAccessToken = await refreshPromise
        refreshPromise = null
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        refreshPromise = null
        tokenStorage.clear()
        window.location.assign('/login')
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error) {
  const data = error?.response?.data
  if (Array.isArray(data?.details) && data.details.length > 0) {
    return data.details.map((detail) => detail.msg.replace(/^Value error, /, '')).join(' ')
  }
  return data?.message || error?.message || 'Something went wrong. Please try again.'
}
