import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, getToken, login as apiLogin, setToken, type User } from './api'

// Role is carried in the JWT claims (backend JwtService), not in UserDto,
// which only has id/name/email. Decode the payload (no verification here;
// the backend verifies on every request) purely for UI gating.
function roleFromToken(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role ?? null
  } catch {
    return null
  }
}

interface AuthState {
  user: User | null
  role: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(() => !!getToken())
  const { data: user, isLoading, error: meError } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    enabled: hasToken,
    retry: false,
  })

  useEffect(() => {
    if (!hasToken) queryClient.setQueryData(['me'], null)
  }, [hasToken, queryClient])

  // Session truly gone (refresh failed, or /auth/me 401): drop the
  // logged-in state instead of leaving a stale token flag behind.
  // This is the back/forward bug: the header kept showing a user while
  // protected pages errored, because hasToken never synced with the
  // cleared localStorage token.
  useEffect(() => {
    if (meError && 'status' in meError && (meError as { status: number }).status === 401) {
      setToken(null)
      setHasToken(false)
    }
  }, [meError])

  useEffect(() => {
    const onCleared = () => setHasToken(false)
    window.addEventListener('store:auth-cleared', onCleared)
    return () => window.removeEventListener('store:auth-cleared', onCleared)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: user ?? null,
      role: hasToken ? roleFromToken() : null,
      loading: isLoading,
      login: async (email, password) => {
        const res = await apiLogin(email, password)
        setToken(res.token)
        setHasToken(true)
        await queryClient.invalidateQueries({ queryKey: ['me'] })
      },
      logout: () => {
        // No logout endpoint exists in the backend: clearing the local
        // access token is the logout. The HttpOnly refresh cookie cannot
        // be cleared from JS and simply expires in 7 days.
        setToken(null)
        setHasToken(false)
        queryClient.setQueryData(['me'], null)
      },
    }),
    [user, hasToken, isLoading, queryClient],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
