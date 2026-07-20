import { useCallback, useEffect, useMemo, useState } from 'react'
import { authService } from '@/services/authService'
import { tokenStorage } from '@/utils/tokenStorage'
import { AuthContext } from '@/contexts/authContextObject'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadCurrentUser = useCallback(async () => {
    if (!tokenStorage.getAccessToken()) {
      setUser(null)
      setIsLoading(false)
      return
    }
    try {
      const currentUser = await authService.fetchCurrentUser()
      setUser(currentUser)
    } catch {
      tokenStorage.clear()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCurrentUser()
  }, [loadCurrentUser])

  const login = useCallback(async (email, password) => {
    await authService.login(email, password)
    const currentUser = await authService.fetchCurrentUser()
    setUser(currentUser)
    return currentUser
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
  }, [])

  const hasPermission = useCallback(
    (permissionCode) => {
      if (!user) return false
      if (user.role === 'Super Admin') return true
      return user.permissions?.includes(permissionCode) ?? false
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticated: Boolean(user), login, logout, hasPermission }),
    [user, isLoading, login, logout, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
