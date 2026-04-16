import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AuthUser, UserRole } from '@/types'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (username: string, pin: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('pp_user')
    if (stored) {
      try {
        setUser(JSON.parse(stored) as AuthUser)
      } catch {
        localStorage.removeItem('pp_user')
      }
    }
    setIsLoading(false)
  }, [])

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
        balance: data.balance as number ?? 0
      }

      setUser(authUser)
      localStorage.setItem('pp_user', JSON.stringify(authUser))
      return { error: null }
    } catch (err) {
      console.error('[Auth] Login error:', err)
      return { error: 'Error de conexión. Intenta de nuevo.' }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setUser(null)
    localStorage.removeItem('pp_user')
    await supabase.auth.signOut().catch(() => {})
  }, [])

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

