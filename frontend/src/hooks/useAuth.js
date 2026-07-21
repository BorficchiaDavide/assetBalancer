import { useState } from 'react'
import { AuthError, login, register, logout, restoreSession } from '../api'

export function useAuth() {
  const [user, setUser] = useState(null)

  async function handleLogin(mode, email, password, displayName) {
    const u = mode === 'signup'
      ? await register(email, password, displayName)
      : await login(email, password)
    setUser(u)
    return u
  }

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  async function handleRestoreSession() {
    const u = await restoreSession()
    if (u) setUser(u)
    return u
  }

  function clearUser() {
    setUser(null)
  }

  return { user, clearUser, handleLogin, handleLogout, handleRestoreSession }
}
