import { apiClient } from '@/services/apiClient'
import { tokenStorage } from '@/utils/tokenStorage'

export const authService = {
  async login(email, password) {
    const { data } = await apiClient.post('/auth/login', { email, password })
    tokenStorage.setTokens(data)
    return data
  },

  async logout() {
    const refreshToken = tokenStorage.getRefreshToken()
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken })
      }
    } finally {
      tokenStorage.clear()
    }
  },

  async fetchCurrentUser() {
    const { data } = await apiClient.get('/auth/me')
    return data
  },

  async changePassword(currentPassword, newPassword) {
    const { data } = await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return data
  },
}
