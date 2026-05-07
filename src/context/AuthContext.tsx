import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AuthUser, UserRole } from '@/types'

const SESSION_STORAGE_KEY = 'pp_user'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

type StoredSession = {
  user: AuthUser
  loginAt: number
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (username: string, pin: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loginAt, setLoginAt] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearSession = useCallback(() => {
    setUser(null)
    setLoginAt(null)
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }, [])

  const isSessionExpired = useCallback((startedAt: number) => {
    return Date.now() - startedAt >= SESSION_TTL_MS
  }, [])

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredSession
        if (parsed?.user && typeof parsed.loginAt === 'number' && !isSessionExpired(parsed.loginAt)) {
          setUser(parsed.user)
          setLoginAt(parsed.loginAt)
        } else {
          clearSession()
        }
      } catch {
        clearSession()
      }
    }
    setIsLoading(false)
  }, [clearSession, isSessionExpired])

  useEffect(() => {
    if (!user || !loginAt) return

    const remainingMs = SESSION_TTL_MS - (Date.now() - loginAt)
    if (remainingMs <= 0) {
      clearSession()
      return
    }

    const timeout = window.setTimeout(() => {
      clearSession()
    }, remainingMs)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [clearSession, loginAt, user])

  const login = useCallback(async (username: string, pin: string): Promise<{ error: string | null }> => {
    setIsLoading(true)
    try {
      // Call the Supabase RPC that verifies username + PIN hash
      const { data, error } = await supabase.rpc('authenticate_user', {
        p_username: username,
        p_pin: pin
      })

      if (error || !data) {
        return { error: 'Usuario o PIN incorrecto' }
      }

      const authUser: AuthUser = {
        id: data.id as string,
        username: data.username as string,
        role: data.role as UserRole,
        team_id: data.team_id as string | null,
        assigned_capital: (data.assigned_capital as number) ?? 0,
        balance: (data.balance as number) ?? 0
      }

      const startedAt = Date.now()
      setUser(authUser)
      setLoginAt(startedAt)
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ user: authUser, loginAt: startedAt } satisfies StoredSession)
      )
      return { error: null }
    } catch (err) {
      console.error('[Auth] Login error:', err)
      return { error: 'Error de conexión. Intenta de nuevo.' }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    clearSession()
    await supabase.auth.signOut().catch(() => {})
  }, [clearSession])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

